import type { WorldConfig, Hex, Terrain } from "../types/world";
import { rngInt } from "./rng";
import { hexKey, hexNeighbors, hexesInRect } from "./hexMath";

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

export interface TerrainResult {
  hexes: Record<string, Hex>;
  allCoords: [number, number][];
  coordSet: Set<string>;
}

export class TerrainGenerator {
  constructor(
    private readonly config: WorldConfig,
    private readonly rng: () => number,
    private readonly onLog?: (msg: string) => void,
  ) {}

  generate(): TerrainResult {
    switch (this.config.mapGenAlgorithm) {
      case "landmass-growth":
        return this.landmassGrowthGen();
      case "landmass-growth-v3":
        return this.landmassGrowthV3();
    }
  }

  // ─── Algorithm: Landmass Growth (v1) ───────────────────────────────────────

  private landmassGrowthGen(): TerrainResult {
    const { width, height, minLandFraction } = this.config;

    const allCoords = hexesInRect(width, height);
    const totalHexes = allCoords.length;
    const coordSet = new Set(allCoords.map(([q, r]) => hexKey(q, r)));

    const terrainMap = new Map<string, Terrain>();
    for (const [q, r] of allCoords) terrainMap.set(hexKey(q, r), "water");

    const maxLandmassSize = Math.max(1, Math.floor(totalHexes * 0.05));
    let landCount = 0;

    while (landCount / totalHexes < minLandFraction) {
      const [startQ, startR] = allCoords[Math.floor(this.rng() * totalHexes)];
      const size = rngInt(this.rng, 1, maxLandmassSize);
      landCount += this.growLandmass(startQ, startR, size, terrainMap, coordSet);
    }

    this.detectLakes(terrainMap, allCoords, coordSet);
    return { hexes: this.buildHexes(terrainMap, allCoords), allCoords, coordSet };
  }

  // ─── Algorithm: Landmass Growth v3 ─────────────────────────────────────────

  private landmassGrowthV3(): TerrainResult {
    const { width, height, minLandFraction } = this.config;

    const allCoords = hexesInRect(width, height);
    const totalHexes = allCoords.length;
    const coordSet = new Set(allCoords.map(([q, r]) => hexKey(q, r)));

    const terrainMap = new Map<string, Terrain>();
    for (const [q, r] of allCoords) terrainMap.set(hexKey(q, r), "water");

    const targetLandHexes = Math.floor(totalHexes * minLandFraction);
    let landCount = 0;

    // ── Phase 1: Continental Cores ─────────────────────────────────────────
    // Spawn large landmasses (3–10% of target land hexes each) until 50% of
    // target land coverage is reached.
    let largeMassIndex = 0;
    while (landCount < targetLandHexes * 0.5) {
      const size = rngInt(
        this.rng,
        Math.max(1, Math.floor(targetLandHexes * 0.03)),
        Math.max(1, Math.floor(targetLandHexes * 0.1)),
      );
      const [startQ, startR] = allCoords[Math.floor(this.rng() * totalHexes)];
      this.onLog?.(`Large landmass #${++largeMassIndex} — growing from (${startQ}, ${startR})`);
      landCount += this.growLandmass(startQ, startR, size, terrainMap, coordSet);
    }

    // ── Phase 2: Coastal Clusters ──────────────────────────────────────────
    // Spawn medium landmasses near existing continents until 85% coverage.
    this.onLog?.("Starting medium landmasses");
    const proximityRadius = Math.max(
      3,
      Math.floor(Math.sqrt(totalHexes) * 0.07),
    );

    const phase1LandHexes: [number, number][] = [];
    for (const [q, r] of allCoords) {
      if (terrainMap.get(hexKey(q, r)) !== "water") phase1LandHexes.push([q, r]);
    }

    while (landCount < targetLandHexes * 0.85) {
      const minSize = 20;
      const maxSize = Math.max(minSize, Math.floor(targetLandHexes * 0.02));
      const size = rngInt(this.rng, minSize, maxSize);

      let startQ!: number;
      let startR!: number;

      if (phase1LandHexes.length > 0) {
        const [anchorQ, anchorR] =
          phase1LandHexes[Math.floor(this.rng() * phase1LandHexes.length)];

        let found = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          const dq = Math.floor((this.rng() * 2 - 1) * proximityRadius);
          const dr = Math.floor((this.rng() * 2 - 1) * proximityRadius);
          const cq = anchorQ + dq;
          const cr = anchorR + dr;
          if (coordSet.has(hexKey(cq, cr))) {
            startQ = cq;
            startR = cr;
            found = true;
            break;
          }
        }
        if (!found) [startQ, startR] = allCoords[Math.floor(this.rng() * totalHexes)];
      } else {
        [startQ, startR] = allCoords[Math.floor(this.rng() * totalHexes)];
      }

      landCount += this.growLandmass(startQ, startR, size, terrainMap, coordSet);
    }

    // ── Phase 3: Scatter Islands ───────────────────────────────────────────
    // Islands placed in clusters of 1–7, each island 1–20 hexes.
    this.onLog?.("Starting small landmasses");
    const islandClusterRadius = Math.max(
      3,
      Math.floor(Math.sqrt(totalHexes) * 0.05),
    );

    while (landCount < targetLandHexes) {
      const clusterSize = rngInt(this.rng, 1, 7);
      let [prevQ, prevR] = allCoords[Math.floor(this.rng() * totalHexes)];
      while (terrainMap.get(hexKey(prevQ, prevR)) !== "water") {
        [prevQ, prevR] = allCoords[Math.floor(this.rng() * totalHexes)];
      }

      for (let c = 0; c < clusterSize && landCount < targetLandHexes; c++) {
        let startQ!: number;
        let startR!: number;

        if (c === 0) {
          startQ = prevQ;
          startR = prevR;
        } else {
          let found = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            const dq = Math.floor((this.rng() * 2 - 1) * islandClusterRadius);
            const dr = Math.floor((this.rng() * 2 - 1) * islandClusterRadius);
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
            do {
              [startQ, startR] = allCoords[Math.floor(this.rng() * totalHexes)];
            } while (terrainMap.get(hexKey(startQ, startR)) !== "water");
          }
        }

        const size = rngInt(this.rng, 1, 20);
        landCount += this.growLandmass(startQ, startR, size, terrainMap, coordSet);
        prevQ = startQ;
        prevR = startR;
      }
    }

    this.regulateMountains(terrainMap, allCoords, coordSet);
    this.detectLakes(terrainMap, allCoords, coordSet);
    return { hexes: this.buildHexes(terrainMap, allCoords), allCoords, coordSet };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private buildHexes(
    terrainMap: Map<string, Terrain>,
    allCoords: [number, number][],
  ): Record<string, Hex> {
    const hexes: Record<string, Hex> = {};
    for (const [q, r] of allCoords) {
      const key = hexKey(q, r);
      const terrain = terrainMap.get(key)!;
      const isWaterLike = terrain === "water" || terrain === "lake";
      hexes[key] = { q, r, regionId: isWaterLike ? "water" : "land", terrain };
    }
    return hexes;
  }

  // Grow a single landmass blob starting from (startQ, startR) up to `size` hexes.
  // Peninsula avoidance: if chosen frontier hex has only one land neighbour, re-roll once.
  private growLandmass(
    startQ: number,
    startR: number,
    size: number,
    terrainMap: Map<string, Terrain>,
    coordSet: Set<string>,
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
      let idx = Math.floor(this.rng() * frontier.length);
      const [cq, cr] = frontier[idx];
      if (landNeighborCount(cq, cr) === 1) {
        // Re-roll once; accept regardless
        idx = Math.floor(this.rng() * frontier.length);
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

  // BFS outward from (startQ, startR) to find the nearest on-grid hex whose
  // terrain passes isValid. Returns null if no such hex exists.
  private findNearestHex(
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

  // Determine direction once from the initial ratio, then run only that direction
  // until the target is met. Flatten: lower mountains toward plains. Raise: vice versa.
  private regulateMountains(
    terrainMap: Map<string, Terrain>,
    allCoords: [number, number][],
    coordSet: Set<string>,
  ): void {
    const { mountainDensity } = this.config;

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
      // ── Flatten: run until mountain% ≤ target ────────────────────────────
      const isFlattenable = (t: Terrain) => t === "mountains" || t === "hills";

      while (mountainCount / landCount > mountainDensity) {
        const mountainHexes: [number, number][] = [];
        for (const [q, r] of allCoords) {
          if (terrainMap.get(hexKey(q, r)) === "mountains") mountainHexes.push([q, r]);
        }
        if (mountainHexes.length === 0) break;

        let [curQ, curR] = mountainHexes[Math.floor(this.rng() * mountainHexes.length)];
        const cycleLength = rngInt(this.rng, 3, 30);

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
            [curQ, curR] = candidates[Math.floor(this.rng() * candidates.length)];
          } else {
            const nearest = this.findNearestHex(curQ, curR, coordSet, terrainMap, isFlattenable);
            if (nearest === null) break;
            [curQ, curR] = nearest;
          }
        }
      }
    } else if (initialRatio < mountainDensity) {
      // ── Raise: run until mountain% ≥ target ──────────────────────────────
      const isRaiseable = (t: Terrain) => t === "plains" || t === "hills";

      while (mountainCount / landCount < mountainDensity) {
        const plainsHexes: [number, number][] = [];
        for (const [q, r] of allCoords) {
          if (terrainMap.get(hexKey(q, r)) === "plains") plainsHexes.push([q, r]);
        }
        if (plainsHexes.length === 0) break;

        let [curQ, curR] = plainsHexes[Math.floor(this.rng() * plainsHexes.length)];
        const cycleLength = rngInt(this.rng, 3, 30);

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
            [curQ, curR] = candidates[Math.floor(this.rng() * candidates.length)];
          } else {
            const nearest = this.findNearestHex(curQ, curR, coordSet, terrainMap, isRaiseable);
            if (nearest === null) break;
            [curQ, curR] = nearest;
          }
        }
      }
    }
  }

  // BFS from every boundary water hex to find ocean-connected water.
  // Inland water bodies ≤ 15 hexes are converted to lakes.
  private detectLakes(
    terrainMap: Map<string, Terrain>,
    allCoords: [number, number][],
    coordSet: Set<string>,
  ): void {
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

    const inlandVisited = new Set<string>();
    for (const [q, r] of allCoords) {
      const key = hexKey(q, r);
      if (
        terrainMap.get(key) !== "water" ||
        oceanKeys.has(key) ||
        inlandVisited.has(key)
      )
        continue;

      const component: string[] = [];
      const queue: [number, number][] = [[q, r]];
      inlandVisited.add(key);
      let cqi = 0;
      while (cqi < queue.length) {
        const [cq, cr] = queue[cqi++];
        component.push(hexKey(cq, cr));
        for (const [nq, nr] of hexNeighbors(cq, cr)) {
          const nKey = hexKey(nq, nr);
          if (
            coordSet.has(nKey) &&
            !inlandVisited.has(nKey) &&
            terrainMap.get(nKey) === "water" &&
            !oceanKeys.has(nKey)
          ) {
            inlandVisited.add(nKey);
            queue.push([nq, nr]);
          }
        }
      }

      if (component.length <= 15) {
        for (const k of component) terrainMap.set(k, "lake");
      }
    }
  }
}
