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
// the 3 adjacent hexes, their neighbors (ring 1), and ring 1's neighbors (ring 2).
// Off-grid hexes contribute 0 (treated as water).
function cornerScore(
  cornerKey: string,
  cornerMap: Map<string, [string, string, string]>,
  getTerrain: (k: string) => Terrain,
): number {
  const triplet = cornerMap.get(cornerKey);
  if (!triplet) return 0;

  const zone = new Set<string>(triplet);
  const ring1 = new Set<string>();
  for (const hk of triplet) {
    const sep = hk.indexOf(",");
    const q = parseInt(hk.slice(0, sep), 10);
    const r = parseInt(hk.slice(sep + 1), 10);
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nk = hexKey(nq, nr);
      zone.add(nk);
      ring1.add(nk);
    }
  }
  for (const hk of ring1) {
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
  // Spawn large landmasses (3–10% of target land hexes each) until 50% of
  // target land coverage is reached.
  while (landCount < targetLandHexes * 0.5) {
    const size = rngInt(
      rng,
      Math.max(1, Math.floor(targetLandHexes * 0.03)),
      Math.max(1, Math.floor(targetLandHexes * 0.10)),
    );
    const [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    landCount += growLandmass(startQ, startR, size, terrainMap, coordSet, rng);
  }

  // ── Phase 2: Coastal Clusters ────────────────────────────────────────────
  // Spawn medium landmasses (20 hexes up to 2% of target land hexes each)
  // near existing continents until 85% of target land coverage is reached.
  // Seed hex is chosen within a proximity radius of a random Phase 1 land hex;
  // falls back to fully random placement if needed.
  const proximityRadius = Math.max(
    3,
    Math.floor(Math.sqrt(totalHexes) * 0.07),
  );

  // Snapshot land hexes after Phase 1 for proximity anchoring.
  const phase1LandHexes: [number, number][] = [];
  for (const [q, r] of allCoords) {
    if (terrainMap.get(hexKey(q, r)) !== "water") {
      phase1LandHexes.push([q, r]);
    }
  }

  while (landCount < targetLandHexes * 0.85) {
    const minSize = 20;
    const maxSize = Math.max(minSize, Math.floor(targetLandHexes * 0.02));
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
  // Islands are placed in clusters of 1–7, each island 1–20 hexes. The first
  // island in a cluster picks a random map position; each subsequent island
  // spawns within a small proximity radius of the previous island's seed.
  // Islands may merge naturally if they grow into each other.
  const islandClusterRadius = Math.max(3, Math.floor(Math.sqrt(totalHexes) * 0.05));

  while (landCount < targetLandHexes) {
    const clusterSize = rngInt(rng, 1, 7);
    let [prevQ, prevR] = allCoords[Math.floor(rng() * totalHexes)];

    for (let c = 0; c < clusterSize && landCount < targetLandHexes; c++) {
      let startQ: number;
      let startR: number;

      if (c === 0) {
        startQ = prevQ;
        startR = prevR;
      } else {
        let found = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          const dq = Math.floor((rng() * 2 - 1) * islandClusterRadius);
          const dr = Math.floor((rng() * 2 - 1) * islandClusterRadius);
          const cq = prevQ + dq;
          const cr = prevR + dr;
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
      }

      const size = rngInt(rng, 1, 20);
      landCount += growLandmass(startQ!, startR!, size, terrainMap, coordSet, rng);
      prevQ = startQ!;
      prevR = startR!;
    }
  }

  regulateMountains(terrainMap, allCoords, coordSet, rng, config.mountainDensity);

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

// BFS outward from (startQ, startR) to find the nearest on-grid hex whose
// terrain passes isValid. Returns null if no such hex exists.
function findNearestHex(
  startQ: number,
  startR: number,
  coordSet: Set<string>,
  terrainMap: Map<string, Terrain>,
  isValid: (t: Terrain) => boolean,
): [number, number] | null {
  const visited = new Set<string>([hexKey(startQ, startR)]);
  const queue: [number, number][] = [[startQ, startR]];
  let qi = 0;
  while (qi < queue.length) {
    const [q, r] = queue[qi++];
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nKey = hexKey(nq, nr);
      if (!coordSet.has(nKey) || visited.has(nKey)) continue;
      visited.add(nKey);
      if (isValid(terrainMap.get(nKey)!)) return [nq, nr];
      queue.push([nq, nr]);
    }
  }
  return null;
}

// ─── Mountain Density Regulation ─────────────────────────────────────────────

// Determine direction once from the initial ratio, then run only that direction
// until the target is met — no cycling between flatten and raise.
//
// Flatten (too many mountains): pick a random mountain hex, walk to adjacent
//   mountains/hills lowering each by one step, 3–30 hexes per cycle. When no
//   adjacent valid hex exists, BFS to the nearest one rather than ending early.
// Raise (too few mountains): pick a random plains hex, walk to adjacent
//   plains/hills raising each by one step, 3–30 hexes per cycle. Same fallback.
function regulateMountains(
  terrainMap: Map<string, Terrain>,
  allCoords: [number, number][],
  coordSet: Set<string>,
  rng: () => number,
  mountainDensity: number,
): void {
  let landCount = 0;
  let mountainCount = 0;
  for (const [q, r] of allCoords) {
    const t = terrainMap.get(hexKey(q, r))!;
    if (t !== "water" && t !== "lake") landCount++;
    if (t === "mountains") mountainCount++;
  }
  if (landCount === 0) return;

  const initialRatio = mountainCount / landCount;

  if (initialRatio > mountainDensity) {
    // ── Flatten: run until mountain% ≤ target ──────────────────────────────
    const isFlattenable = (t: Terrain) => t === "mountains" || t === "hills";

    while (mountainCount / landCount > mountainDensity) {
      const mountainHexes: [number, number][] = [];
      for (const [q, r] of allCoords) {
        if (terrainMap.get(hexKey(q, r)) === "mountains") mountainHexes.push([q, r]);
      }
      if (mountainHexes.length === 0) break;

      let [curQ, curR] = mountainHexes[Math.floor(rng() * mountainHexes.length)];
      const cycleLength = rngInt(rng, 3, 30);

      for (let i = 0; i < cycleLength; i++) {
        const key = hexKey(curQ, curR);
        const t = terrainMap.get(key)!;
        if (t === "mountains") {
          terrainMap.set(key, "hills");
          mountainCount--;
        } else if (t === "hills") {
          terrainMap.set(key, "plains");
        }

        const candidates: [number, number][] = [];
        for (const [nq, nr] of hexNeighbors(curQ, curR)) {
          const nKey = hexKey(nq, nr);
          if (coordSet.has(nKey) && isFlattenable(terrainMap.get(nKey)!)) {
            candidates.push([nq, nr]);
          }
        }
        if (candidates.length > 0) {
          [curQ, curR] = candidates[Math.floor(rng() * candidates.length)];
        } else {
          const nearest = findNearestHex(curQ, curR, coordSet, terrainMap, isFlattenable);
          if (nearest === null) break;
          [curQ, curR] = nearest;
        }
      }
    }
  } else if (initialRatio < mountainDensity) {
    // ── Raise: run until mountain% ≥ target ───────────────────────────────
    const isRaiseable = (t: Terrain) => t === "plains" || t === "hills";

    while (mountainCount / landCount < mountainDensity) {
      const plainsHexes: [number, number][] = [];
      for (const [q, r] of allCoords) {
        if (terrainMap.get(hexKey(q, r)) === "plains") plainsHexes.push([q, r]);
      }
      if (plainsHexes.length === 0) break;

      let [curQ, curR] = plainsHexes[Math.floor(rng() * plainsHexes.length)];
      const cycleLength = rngInt(rng, 3, 30);

      for (let i = 0; i < cycleLength; i++) {
        const key = hexKey(curQ, curR);
        const t = terrainMap.get(key)!;
        if (t === "plains") {
          terrainMap.set(key, "hills");
        } else if (t === "hills") {
          terrainMap.set(key, "mountains");
          mountainCount++;
        }

        const candidates: [number, number][] = [];
        for (const [nq, nr] of hexNeighbors(curQ, curR)) {
          const nKey = hexKey(nq, nr);
          if (coordSet.has(nKey) && isRaiseable(terrainMap.get(nKey)!)) {
            candidates.push([nq, nr]);
          }
        }
        if (candidates.length > 0) {
          [curQ, curR] = candidates[Math.floor(rng() * candidates.length)];
        } else {
          const nearest = findNearestHex(curQ, curR, coordSet, terrainMap, isRaiseable);
          if (nearest === null) break;
          [curQ, curR] = nearest;
        }
      }
    }
  }
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

  // ── Post-process: classify large rivers ──────────────────────────────────
  // Build an index: cornerKey → indices of rivers whose last corner is that key.
  const terminalCorners = new Map<string, number[]>();
  for (let ri = 0; ri < rivers.length; ri++) {
    const lastCorner = rivers[ri].corners[rivers[ri].corners.length - 1];
    if (!terminalCorners.has(lastCorner)) terminalCorners.set(lastCorner, []);
    terminalCorners.get(lastCorner)!.push(ri);
  }

  for (let ri = 0; ri < rivers.length; ri++) {
    const river = rivers[ri];

    // Rule 1: lake source — first corner touches a lake hex
    const firstHexes = cornerMap.get(river.corners[0]);
    if (firstHexes?.some((k) => getTerrain(k) === "lake")) {
      river.largeFromIndex = 0;
      continue;
    }

    // Rule 2: tributary junction — first corner in this river that is the
    // terminal corner of any other river
    for (let ci = 0; ci < river.corners.length; ci++) {
      const tributaries = terminalCorners.get(river.corners[ci]);
      if (tributaries && tributaries.some((tri) => tri !== ri)) {
        river.largeFromIndex = ci;
        break;
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

    // Exclude steps where either shared hex (the edge being crossed) is water or lake.
    // This prevents rivers from running through lake/water interiors or along their shores.
    const currentHexSet = new Set(currentHexes);
    const nonInterior = nonCyclic.filter((a) => {
      const shared = a.hexKeys.filter((k) => currentHexSet.has(k));
      return shared.every((k) => {
        const t = getTerrain(k);
        return t !== "water" && t !== "lake";
      });
    });

    if (nonInterior.length === 0) break;

    // Terminate: any neighbor touches water or lake (ignoring the origin lake we're flowing out of)
    const terminals = nonInterior.filter((a) =>
      a.hexKeys.some((k) => isTerminal(getTerrain(k)) && !originLakeKeys?.has(k)),
    );
    if (terminals.length > 0) {
      corners.push(rngPick(rng, terminals).key);
      break;
    }

    // Terminate: any neighbor is already on another river (tributary junction)
    const junctions = nonInterior.filter((a) => allRiverCorners.has(a.key));
    if (junctions.length > 0) {
      corners.push(rngPick(rng, junctions).key);
      break;
    }

    // Normal step: terrain-descent bias — pick lowest-scoring candidate(s), break ties randomly
    const scored = nonInterior.map((c) => ({
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
