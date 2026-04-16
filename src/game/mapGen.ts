import type { World, WorldConfig, Hex, Terrain, River } from "../types/world";
import { makeRng, rngInt, rngPick, rngShuffle } from "./rng";
import {
  hexKey,
  hexNeighbors,
  hexesInRect,
  hexCornerTriplets,
  adjacentCornerTriplets,
} from "./hexMath";

// Terrain height values used for river descent scoring (lower = more downhill)
const TERRAIN_HEIGHT: Record<Terrain, number> = {
  mountains: 5,
  hills: 3,
  plains: 1,
  lake: 1,
  forest: 1,
  desert: 1,
  coast: 1,
  water: 0,
};

// Score a corner by summing terrain heights of its influence zone:
// the 3 adjacent hexes plus all their neighbors (up to 12 unique hexes).
// Off-grid hexes contribute 0 (treated as water).
function cornerScore(
  cornerKey: string,
  cornerMap: Map<string, [string, string, string]>,
  getTerrain: (k: string) => Terrain,
): number {
  const triplet = cornerMap.get(cornerKey);
  if (!triplet) return 0;

  const zone = new Set<string>(triplet);
  for (const hk of triplet) {
    const sep = hk.indexOf(",");
    const q = parseInt(hk.slice(0, sep), 10);
    const r = parseInt(hk.slice(sep + 1), 10);
    for (const [nq, nr] of hexNeighbors(q, r)) {
      zone.add(hexKey(nq, nr));
    }
  }

  let score = 0;
  for (const hk of zone) {
    score += TERRAIN_HEIGHT[getTerrain(hk)] ?? 0;
  }
  return score;
}

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
      return landmassGrowthGen(config, rng);
    case "landmass-growth-v3":
      return landmassGrowthV3(config, rng);
  }
}

// ─── Shared Growth Helper ─────────────────────────────────────────────────────

// Grow a single landmass blob starting from (startQ, startR) up to `size` hexes.
// Peninsula avoidance is always on: if the chosen frontier hex has only one land
// neighbour, re-roll once before accepting.
function growLandmass(
  startQ: number,
  startR: number,
  size: number,
  terrainMap: Map<string, Terrain>,
  coordSet: Set<string>,
  rng: () => number,
): number {
  const isLand = (key: string): boolean => {
    const t = terrainMap.get(key);
    return t !== undefined && t !== "water";
  };
  const landNeighborCount = (q: number, r: number): number =>
    hexNeighbors(q, r).filter(([nq, nr]) => isLand(hexKey(nq, nr))).length;

  const frontier: [number, number][] = [[startQ, startR]];
  const visited = new Set<string>([hexKey(startQ, startR)]);
  let added = 0;
  let newLand = 0;

  while (frontier.length > 0 && added < size) {
    let idx = Math.floor(rng() * frontier.length);
    const [cq, cr] = frontier[idx];
    if (landNeighborCount(cq, cr) === 1) {
      // Re-roll once; accept regardless
      idx = Math.floor(rng() * frontier.length);
    }

    const [q, r] = frontier[idx];
    frontier.splice(idx, 1);

    const key = hexKey(q, r);
    const current = terrainMap.get(key)!;
    if (current === "water") newLand++;
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

  return newLand;
}

// ─── Landmass Growth (v1 cleanup) ────────────────────────────────────────────

function landmassGrowthGen(
  config: WorldConfig,
  rng: () => number,
): World {
  const { width, height, minLandFraction } = config;

  const allCoords = hexesInRect(width, height);
  const totalHexes = allCoords.length;
  const coordSet = new Set(allCoords.map(([q, r]) => hexKey(q, r)));

  const terrainMap = new Map<string, Terrain>();
  for (const [q, r] of allCoords) {
    terrainMap.set(hexKey(q, r), "water");
  }

  const maxLandmassSize = Math.max(1, Math.floor(totalHexes * 0.05));
  let landCount = 0;

  while (landCount / totalHexes < minLandFraction) {
    const [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    const size = rngInt(rng, 1, maxLandmassSize);
    landCount += growLandmass(startQ, startR, size, terrainMap, coordSet, rng);
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

// ─── Landmass Growth v3 ───────────────────────────────────────────────────────

function landmassGrowthV3(
  config: WorldConfig,
  rng: () => number,
): World {
  const { width, height, minLandFraction } = config;

  const allCoords = hexesInRect(width, height);
  const totalHexes = allCoords.length;
  const coordSet = new Set(allCoords.map(([q, r]) => hexKey(q, r)));

  const terrainMap = new Map<string, Terrain>();
  for (const [q, r] of allCoords) {
    terrainMap.set(hexKey(q, r), "water");
  }

  const targetLandHexes = Math.floor(totalHexes * minLandFraction);
  let landCount = 0;

  // ── Phase 1: Continental Cores ───────────────────────────────────────────
  // 3–5 large landmasses, each 2–5% of target land hexes.
  const continentCount = rngInt(rng, 3, 5);
  for (let i = 0; i < continentCount; i++) {
    const size = rngInt(
      rng,
      Math.max(1, Math.floor(targetLandHexes * 0.02)),
      Math.max(1, Math.floor(targetLandHexes * 0.05)),
    );
    const [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    landCount += growLandmass(startQ, startR, size, terrainMap, coordSet, rng);
  }

  // ── Phase 2: Coastal Clusters ────────────────────────────────────────────
  // 5–20 medium landmasses near existing continents, 20 hexes up to 1% of
  // total map hexes. Seed hex is chosen within a proximity radius of a random
  // Phase 1 land hex; falls back to fully random placement if needed.
  const clusterCount = rngInt(rng, 5, 20);
  const proximityRadius = Math.max(
    5,
    Math.floor(Math.sqrt(totalHexes) * 0.15),
  );

  // Snapshot land hexes after Phase 1 for proximity anchoring.
  const phase1LandHexes: [number, number][] = [];
  for (const [q, r] of allCoords) {
    if (terrainMap.get(hexKey(q, r)) !== "water") {
      phase1LandHexes.push([q, r]);
    }
  }

  for (let i = 0; i < clusterCount; i++) {
    const minSize = 20;
    const maxSize = Math.max(minSize, Math.floor(totalHexes * 0.01));
    const size = rngInt(rng, minSize, maxSize);

    let startQ: number;
    let startR: number;

    if (phase1LandHexes.length > 0) {
      // Pick a random anchor from Phase 1 land, then offset by a random
      // vector within the proximity radius. Re-roll up to 10 times if
      // the result lands off-grid; fall back to fully random if exhausted.
      const [anchorQ, anchorR] =
        phase1LandHexes[Math.floor(rng() * phase1LandHexes.length)];

      let found = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const dq = Math.floor((rng() * 2 - 1) * proximityRadius);
        const dr = Math.floor((rng() * 2 - 1) * proximityRadius);
        const cq = anchorQ + dq;
        const cr = anchorR + dr;
        if (coordSet.has(hexKey(cq, cr))) {
          startQ = cq;
          startR = cr;
          found = true;
          break;
        }
      }
      if (!found) {
        [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
      }
    } else {
      [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    }

    landCount += growLandmass(startQ!, startR!, size, terrainMap, coordSet, rng);
  }

  // ── Phase 3: Scatter Islands ─────────────────────────────────────────────
  // 1–20 hex islands placed at random until target land coverage is met.
  while (landCount / totalHexes < minLandFraction) {
    const [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    const size = rngInt(rng, 1, 20);
    landCount += growLandmass(startQ, startR, size, terrainMap, coordSet, rng);
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

  // Any water hex not reachable from the boundary = inland.
  // Flood-fill each inland water component; only convert to lake if ≤ 15 hexes.
  const inlandVisited = new Set<string>();
  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (terrainMap.get(key) !== "water" || oceanKeys.has(key) || inlandVisited.has(key)) continue;

    // BFS to collect the connected inland water component
    const component: string[] = [];
    const queue: [number, number][] = [[q, r]];
    inlandVisited.add(key);
    let qi = 0;
    while (qi < queue.length) {
      const [cq, cr] = queue[qi++];
      component.push(hexKey(cq, cr));
      for (const [nq, nr] of hexNeighbors(cq, cr)) {
        const nKey = hexKey(nq, nr);
        if (coordSet.has(nKey) && !inlandVisited.has(nKey) && terrainMap.get(nKey) === "water" && !oceanKeys.has(nKey)) {
          inlandVisited.add(nKey);
          queue.push([nq, nr]);
        }
      }
    }

    if (component.length <= 15) {
      for (const k of component) terrainMap.set(k, "lake");
    }
    // Groups larger than 15 stay as "water" (ocean)
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

      const { corners, loopedAt } = traceRiverCorners(
        startKey,
        cornerMap,
        allRiverCorners,
        getTerrain,
        isTerminal,
        rng,
      );

      if (loopedAt) {
        handleLoopLake(
          loopedAt,
          1,
          cornerMap,
          hexes,
          getTerrain,
          isTerminal,
          allRiverCorners,
          rivers,
          rng,
        );
      }

      if (corners.length >= 3) {
        for (const ck of corners) allRiverCorners.add(ck);
        rivers.push({ id: `river_${rivers.length}`, corners });
        riversForMass++;

        // Lake outlet: if river ended in a lake, 80% chance to spawn another river from that lake
        const lastKey = corners[corners.length - 1];
        const lastHexes = cornerMap.get(lastKey);
        const endsInLake = lastHexes?.some((k) => getTerrain(k) === "lake") ?? false;
        if (endsInLake && rng() < 0.8) {
          const lakeHex = lastHexes!.find((k) => getTerrain(k) === "lake")!;
          spawnLakeOutlet(
            lakeHex,
            1,
            cornerMap,
            hexes,
            getTerrain,
            isTerminal,
            allRiverCorners,
            rivers,
            rng,
          );
        }
      }
    }
  }

  return rivers;
}

// Spawn a river outlet from a lake group, with chained outlets up to depth 5.
// Preferred start corners are those touching 2+ lake hexes (more interior to the lake);
// fallback corners touch exactly 1 lake hex (lake shore).
function spawnLakeOutlet(
  lakeHexKey: string,
  chainDepth: number,
  cornerMap: Map<string, [string, string, string]>,
  hexes: Record<string, Hex>,
  getTerrain: (k: string) => Terrain,
  isTerminal: (t: Terrain) => boolean,
  allRiverCorners: Set<string>,
  rivers: River[],
  rng: () => number,
): void {
  if (chainDepth > 5) return;

  // Flood-fill the connected lake group from the terminal lake hex
  const lakeGroup = new Set<string>([lakeHexKey]);
  const lakeQueue: string[] = [lakeHexKey];
  let qi = 0;
  while (qi < lakeQueue.length) {
    const key = lakeQueue[qi++];
    const sep = key.indexOf(",");
    const q = parseInt(key.slice(0, sep), 10);
    const r = parseInt(key.slice(sep + 1), 10);
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nKey = hexKey(nq, nr);
      if (!lakeGroup.has(nKey) && getTerrain(nKey) === "lake") {
        lakeGroup.add(nKey);
        lakeQueue.push(nKey);
      }
    }
  }

  // Collect candidate start corners touching the lake group, not already on a river.
  // Preferred: 2+ lake hexes in the triplet. Fallback: exactly 1.
  const preferred: string[] = [];
  const fallback: string[] = [];
  for (const [ck, hexKeys] of cornerMap) {
    if (allRiverCorners.has(ck)) continue;
    const lakeCount = hexKeys.filter((k) => lakeGroup.has(k)).length;
    if (lakeCount >= 2) preferred.push(ck);
    else if (lakeCount === 1) fallback.push(ck);
  }

  const candidates = [
    ...rngShuffle(rng, preferred),
    ...rngShuffle(rng, fallback),
  ];

  for (const startKey of candidates) {
    if (allRiverCorners.has(startKey)) continue;

    const { corners, loopedAt } = traceRiverCorners(
      startKey,
      cornerMap,
      allRiverCorners,
      getTerrain,
      isTerminal,
      rng,
      lakeGroup,
    );

    if (loopedAt) {
      handleLoopLake(
        loopedAt,
        chainDepth + 1,
        cornerMap,
        hexes,
        getTerrain,
        isTerminal,
        allRiverCorners,
        rivers,
        rng,
      );
    }

    if (corners.length >= 3) {
      for (const ck of corners) allRiverCorners.add(ck);
      rivers.push({ id: `river_${rivers.length}`, corners });

      // Chain: if this outlet also ends in a lake, possibly spawn another
      const lastKey = corners[corners.length - 1];
      const lastHexes = cornerMap.get(lastKey);
      const outletEndsInLake =
        lastHexes?.some((k) => getTerrain(k) === "lake") ?? false;
      if (outletEndsInLake && rng() < 0.8) {
        const nextLakeHex = lastHexes!.find((k) => getTerrain(k) === "lake")!;
        spawnLakeOutlet(
          nextLakeHex,
          chainDepth + 1,
          cornerMap,
          hexes,
          getTerrain,
          isTerminal,
          allRiverCorners,
          rivers,
          rng,
        );
      }
      break; // one outlet per lake group per invocation
    }
  }
}

function traceRiverCorners(
  startKey: string,
  cornerMap: Map<string, [string, string, string]>,
  allRiverCorners: Set<string>,
  getTerrain: (k: string) => Terrain,
  isTerminal: (t: Terrain) => boolean,
  rng: () => number,
  originLakeKeys?: Set<string>,
): { corners: string[]; loopedAt?: string } {
  const corners: string[] = [startKey];
  const visited = new Set<string>([startKey]);
  let currentKey = startKey;
  let loopedAt: string | undefined;

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
    if (nonCyclic.length === 0) {
      loopedAt = currentKey;
      break;
    }

    // Terminate: any neighbor touches water or lake (ignoring the origin lake we're flowing out of)
    const terminals = nonCyclic.filter((a) =>
      a.hexKeys.some((k) => isTerminal(getTerrain(k)) && !originLakeKeys?.has(k)),
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

    // Normal step: terrain-descent bias — pick lowest-scoring candidate(s), break ties randomly
    const scored = nonCyclic.map((c) => ({
      c,
      score: cornerScore(c.key, cornerMap, getTerrain),
    }));
    const minScore = Math.min(...scored.map((s) => s.score));
    const downhill = scored.filter((s) => s.score === minScore).map((s) => s.c);
    const next = rngPick(rng, downhill);
    corners.push(next.key);
    visited.add(next.key);
    currentKey = next.key;
  }

  return { corners, loopedAt };
}

// When a river loops back on itself, convert 1–3 adjacent land hexes to lake
// and spawn an outlet river from the new lake.
function handleLoopLake(
  loopedAt: string,
  chainDepth: number,
  cornerMap: Map<string, [string, string, string]>,
  hexes: Record<string, Hex>,
  getTerrain: (k: string) => Terrain,
  isTerminal: (t: Terrain) => boolean,
  allRiverCorners: Set<string>,
  rivers: River[],
  rng: () => number,
): void {
  if (chainDepth > 5) return;

  const triplet = cornerMap.get(loopedAt);
  if (!triplet) return;

  // Only convert non-water, non-lake hexes that exist in the grid
  const landHexes = triplet.filter((k) => {
    const t = getTerrain(k);
    return t !== "water" && t !== "lake";
  });
  if (landHexes.length === 0) return;

  const count = rngInt(rng, 1, Math.min(3, landHexes.length));
  const shuffled = rngShuffle(rng, [...landHexes]);
  const newLakeHexes = shuffled.slice(0, count);

  for (const k of newLakeHexes) {
    if (hexes[k]) {
      hexes[k].terrain = "lake";
      hexes[k].regionId = "water";
    }
  }

  spawnLakeOutlet(
    newLakeHexes[0],
    chainDepth,
    cornerMap,
    hexes,
    getTerrain,
    isTerminal,
    allRiverCorners,
    rivers,
    rng,
  );
}
