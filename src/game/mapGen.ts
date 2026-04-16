import type { World, WorldConfig, Hex, Terrain, River } from "../types/world";
import { makeRng, rngInt, rngPick, rngShuffle } from "./rng";
import {
  hexKey,
  hexNeighbors,
  hexesInRect,
  hexCornerTriplets,
  adjacentCornerTriplets,
} from "./hexMath";

// Elevation ladder: each time a hex is "selected" it moves one step up
const ELEVATION: Record<Terrain, Terrain> = {
  water: "plains",
  plains: "hills",
  hills: "mountains",
  mountains: "mountains",
  lake: "lake",
  forest: "forest",
  desert: "desert",
  coast: "coast",
};

export function generateWorld(config: WorldConfig): World {
  const rng = makeRng(config.seed);
  switch (config.mapGenAlgorithm) {
    case "landmass-growth":
      return landmassGrowthGen(config, rng, false);
    case "landmass-growth-v2":
      return landmassGrowthGen(config, rng, true);
  }
}

function landmassGrowthGen(
  config: WorldConfig,
  rng: () => number,
  peninsulaAvoidance: boolean,
): World {
  const { width, height, minLandFraction } = config;

  const allCoords = hexesInRect(width, height);
  const totalHexes = allCoords.length;
  const coordSet = new Set(allCoords.map(([q, r]) => hexKey(q, r)));

  // Fill map with water
  const terrainMap = new Map<string, Terrain>();
  for (const [q, r] of allCoords) {
    terrainMap.set(hexKey(q, r), "water");
  }

  const maxLandmassSize = Math.max(1, Math.floor(totalHexes * 0.05));
  let landCount = 0;

  const isLand = (key: string): boolean => {
    const t = terrainMap.get(key);
    return t !== undefined && t !== "water";
  };

  const landNeighborCount = (q: number, r: number): number =>
    hexNeighbors(q, r).filter(([nq, nr]) => isLand(hexKey(nq, nr))).length;

  while (landCount / totalHexes < minLandFraction) {
    const [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    const size = rngInt(rng, 1, maxLandmassSize);

    const frontier: [number, number][] = [[startQ, startR]];
    const visited = new Set<string>([hexKey(startQ, startR)]);
    let added = 0;

    while (frontier.length > 0 && added < size) {
      let idx = Math.floor(rng() * frontier.length);

      if (peninsulaAvoidance) {
        const [cq, cr] = frontier[idx];
        if (landNeighborCount(cq, cr) === 1) {
          // Re-roll once; accept the result regardless
          idx = Math.floor(rng() * frontier.length);
        }
      }

      const [q, r] = frontier[idx];
      frontier.splice(idx, 1);

      const key = hexKey(q, r);
      const current = terrainMap.get(key)!;
      if (current === "water") landCount++;
      terrainMap.set(key, ELEVATION[current]);
      added++;

      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (coordSet.has(nKey) && !visited.has(nKey)) {
          visited.add(nKey);
          frontier.push([nq, nr]);
        }
      }
    }
  }

  detectLakes(terrainMap, allCoords, coordSet);

  // Build hex records
  const hexes: Record<string, Hex> = {};
  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    const terrain = terrainMap.get(key)!;
    const isWaterLike = terrain === "water" || terrain === "lake";
    hexes[key] = { q, r, regionId: isWaterLike ? "water" : "land", terrain };
  }

  const rivers = generateRivers(hexes, coordSet, allCoords, config, rng);

  const regions = {
    water: {
      id: "water",
      name: "Ocean",
      dominantTerrain: "water" as Terrain,
      ownerId: null,
      hexIds: Object.keys(hexes).filter((k) => hexes[k].regionId === "water"),
      rivers: [] as never[],
      cities: [] as never[],
      villages: [] as never[],
    },
    land: {
      id: "land",
      name: "Land",
      dominantTerrain: "plains" as Terrain,
      ownerId: null,
      hexIds: Object.keys(hexes).filter((k) => hexes[k].regionId === "land"),
      rivers: [] as never[],
      cities: [] as never[],
      villages: [] as never[],
    },
  };

  return { config, hexes, regions, rivers };
}

// ─── Lake Detection ──────────────────────────────────────────────────────────

function detectLakes(
  terrainMap: Map<string, Terrain>,
  allCoords: [number, number][],
  coordSet: Set<string>,
): void {
  // BFS from every water hex on the map boundary to find ocean-connected water
  const oceanQueue: [number, number][] = [];
  const oceanKeys = new Set<string>();

  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (terrainMap.get(key) !== "water") continue;
    const onBoundary = hexNeighbors(q, r).some(
      ([nq, nr]) => !coordSet.has(hexKey(nq, nr)),
    );
    if (onBoundary) {
      oceanKeys.add(key);
      oceanQueue.push([q, r]);
    }
  }

  let qi = 0;
  while (qi < oceanQueue.length) {
    const [q, r] = oceanQueue[qi++];
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nKey = hexKey(nq, nr);
      if (
        coordSet.has(nKey) &&
        !oceanKeys.has(nKey) &&
        terrainMap.get(nKey) === "water"
      ) {
        oceanKeys.add(nKey);
        oceanQueue.push([nq, nr]);
      }
    }
  }

  // Any water hex not reachable from the boundary = inland → lake
  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (terrainMap.get(key) === "water" && !oceanKeys.has(key)) {
      terrainMap.set(key, "lake");
    }
  }
}

// ─── River Generation ─────────────────────────────────────────────────────────

function generateRivers(
  hexes: Record<string, Hex>,
  coordSet: Set<string>,
  allCoords: [number, number][],
  config: WorldConfig,
  rng: () => number,
): River[] {
  const { minLandmassForRiver, hexesPerRiver } = config;

  // Build corner map: cornerKey → sorted [h1k, h2k, h3k]
  const cornerMap = new Map<string, [string, string, string]>();
  for (const [q, r] of allCoords) {
    for (const triplet of hexCornerTriplets(q, r)) {
      const key = triplet.join("|");
      if (!cornerMap.has(key)) cornerMap.set(key, triplet);
    }
  }

  const getTerrain = (k: string): Terrain => hexes[k]?.terrain ?? "water";
  const isSource = (t: Terrain) =>
    t === "mountains" || t === "hills" || t === "lake";
  const isTerminal = (t: Terrain) => t === "water" || t === "lake";

  // Find connected landmasses (for minLandmassForRiver gate)
  const globalVisited = new Set<string>();
  const landmasses: [number, number][][] = [];

  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (globalVisited.has(key)) continue;
    const terrain = hexes[key].terrain;
    if (terrain === "water" || terrain === "lake") continue;

    const mass: [number, number][] = [];
    const queue: [number, number][] = [[q, r]];
    globalVisited.add(key);
    let qi = 0;
    while (qi < queue.length) {
      const [cq, cr] = queue[qi++];
      mass.push([cq, cr]);
      for (const [nq, nr] of hexNeighbors(cq, cr)) {
        const nKey = hexKey(nq, nr);
        if (globalVisited.has(nKey) || !coordSet.has(nKey)) continue;
        const nt = hexes[nKey].terrain;
        if (nt !== "water" && nt !== "lake") {
          globalVisited.add(nKey);
          queue.push([nq, nr]);
        }
      }
    }
    landmasses.push(mass);
  }

  const allRiverCorners = new Set<string>();
  const rivers: River[] = [];

  for (const mass of landmasses) {
    if (mass.length < minLandmassForRiver) continue;

    const targetCount = Math.max(1, Math.floor(mass.length / hexesPerRiver));

    // Collect valid start corners for this landmass: touch a source terrain,
    // not already on a river, and have at least one non-terminal neighbor
    // (otherwise they'd produce a trivially short river)
    const massKeySet = new Set(mass.map(([q, r]) => hexKey(q, r)));
    const candidates: string[] = [];

    for (const [ck, hexKeys] of cornerMap) {
      if (allRiverCorners.has(ck)) continue;
      if (!hexKeys.some((k) => massKeySet.has(k))) continue;
      if (!hexKeys.some((k) => isSource(getTerrain(k)))) continue;
      candidates.push(ck);
    }

    const shuffled = rngShuffle(rng, candidates);
    let startIdx = 0;
    let riversForMass = 0;

    while (riversForMass < targetCount && startIdx < shuffled.length) {
      const startKey = shuffled[startIdx++];
      if (allRiverCorners.has(startKey)) continue;

      const corners = traceRiverCorners(
        startKey,
        cornerMap,
        allRiverCorners,
        getTerrain,
        isTerminal,
        rng,
      );

      if (corners.length >= 3) {
        for (const ck of corners) allRiverCorners.add(ck);
        rivers.push({ id: `river_${rivers.length}`, corners });
        riversForMass++;
      }
    }
  }

  return rivers;
}

function traceRiverCorners(
  startKey: string,
  cornerMap: Map<string, [string, string, string]>,
  allRiverCorners: Set<string>,
  getTerrain: (k: string) => Terrain,
  isTerminal: (t: Terrain) => boolean,
  rng: () => number,
): string[] {
  const corners: string[] = [startKey];
  const visited = new Set<string>([startKey]);
  let currentKey = startKey;

  while (corners.length < 300) {
    const currentHexes = cornerMap.get(currentKey);
    if (!currentHexes) break;

    const adjTriplets = adjacentCornerTriplets(
      currentHexes[0],
      currentHexes[1],
      currentHexes[2],
    );
    const adjacent = adjTriplets.map((trip) => ({
      key: trip.join("|"),
      hexKeys: trip,
    }));

    // Exclude corners already in this river (no cycles)
    const nonCyclic = adjacent.filter((a) => !visited.has(a.key));
    if (nonCyclic.length === 0) break;

    // Terminate: any neighbor touches water or lake
    const terminals = nonCyclic.filter((a) =>
      a.hexKeys.some((k) => isTerminal(getTerrain(k))),
    );
    if (terminals.length > 0) {
      corners.push(rngPick(rng, terminals).key);
      break;
    }

    // Terminate: any neighbor is already on another river (tributary junction)
    const junctions = nonCyclic.filter((a) => allRiverCorners.has(a.key));
    if (junctions.length > 0) {
      corners.push(rngPick(rng, junctions).key);
      break;
    }

    // Normal step: random
    const next = rngPick(rng, nonCyclic);
    corners.push(next.key);
    visited.add(next.key);
    currentKey = next.key;
  }

  return corners;
}
