import type { WorldConfig, Hex, Region, Terrain, City } from "../types/world";
import { hexKey, NEIGHBOR_DIRS } from "./hexMath";
import { getRegionName } from "./regionNames";
import { getOceanRegionName } from "./oceanRegionNames";

const LAND_TERRAINS = new Set<Terrain>(["plains", "forest", "mountains", "hills", "desert"]);
const OCEAN_DOM_TERRAINS = new Set<Terrain>(["water", "coast", "lake"]);

export class RegionGenerator {
  // Shared mutable state across all generation steps
  private regions: Record<string, Region> = {};
  private assigned = new Set<string>();
  private regionHexCount = new Map<string, number>();
  private landNameIdx = 0;
  private bfsCount = 0;
  private landImpassableCount = 0;
  private oceanImpassableCount = 0;
  private oceanNameIdx = 0;
  private avgMapAttr = 1;

  constructor(
    private readonly config: WorldConfig,
    private readonly hexes: Record<string, Hex>,
    private readonly allCoords: [number, number][],
    private readonly rng: () => number,
    private readonly cities: City[] = [],
    private readonly onLog?: (msg: string) => void,
  ) {}

  generate(): Record<string, Region> {
    if (this.config.regionGenAlgorithm === "none") {
      return this.placeholderRegions();
    }
    return this.weightedBfs();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private floodFill(
    startKey: string,
    candidates: Set<string>,
    visited: Set<string>,
  ): string[] {
    const component: string[] = [];
    const queue = [startKey];
    visited.add(startKey);
    let qi = 0;
    while (qi < queue.length) {
      const k = queue[qi++];
      component.push(k);
      const hex = this.hexes[k];
      for (const [dq, dr] of NEIGHBOR_DIRS) {
        const nk = hexKey(hex.q + dq, hex.r + dr);
        if (!candidates.has(nk) || visited.has(nk)) continue;
        visited.add(nk);
        queue.push(nk);
      }
    }
    return component;
  }

  private dominantTerrain(hexKeys: string[]): Terrain {
    const counts = new Map<Terrain, number>();
    for (const k of hexKeys) {
      const t = this.hexes[k].terrain;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    let best: Terrain = "plains";
    let bestCount = -1;
    for (const [terrain, count] of counts) {
      if (count > bestCount) { bestCount = count; best = terrain; }
    }
    return best;
  }

  // ── "none" algorithm ──────────────────────────────────────────────────────

  private placeholderRegions(): Record<string, Region> {
    const landKeys: string[] = [];
    const waterKeys: string[] = [];
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      if (LAND_TERRAINS.has(this.hexes[k].terrain)) {
        this.hexes[k].regionId = "land";
        landKeys.push(k);
      } else {
        this.hexes[k].regionId = "water";
        waterKeys.push(k);
      }
    }
    return {
      land: { id: "land", name: "Land", regionType: "land", dominantTerrain: "plains", ownerId: null, hexIds: landKeys, isImpassable: false, rivers: [], cities: [] },
      water: { id: "water", name: "Ocean", regionType: "land", dominantTerrain: "water", ownerId: null, hexIds: waterKeys, isImpassable: true, rivers: [], cities: [] },
    };
  }

  // ── "weighted-bfs" algorithm ──────────────────────────────────────────────

  private weightedBfs(): Record<string, Region> {
    this.onLog?.(`Starting region generation — weighted-bfs, mean size ${this.config.meanRegionSize}`);

    this.regions = {};
    this.assigned = new Set<string>();
    this.regionHexCount = new Map<string, number>();
    this.landNameIdx = 0;
    this.bfsCount = 0;
    this.landImpassableCount = 0;
    this.oceanImpassableCount = 0;
    this.oceanNameIdx = 0;

    // ── Step 0: City region seeding ───────────────────────────────────────
    const cityHexMap = new Map<string, City>();
    for (const city of this.cities) cityHexMap.set(city.hexKey, city);

    const megacityCount = Math.max(1, Math.round(this.cities.length * 0.05));
    let cityRegionCount = 0;

    for (let i = 0; i < megacityCount; i++) {
      let bestKey: string | null = null;
      let bestAttr = -Infinity;
      for (const [k] of cityHexMap) {
        if (this.assigned.has(k)) continue;
        const attr = this.hexes[k]?.baseSettlerAttraction ?? 0;
        if (attr > bestAttr) { bestAttr = attr; bestKey = k; }
      }
      if (bestKey === null) break;

      const seedCity = cityHexMap.get(bestKey)!;
      const regionId = `city-${cityRegionCount}`;
      const hexIds: string[] = [bestKey];
      this.assigned.add(bestKey);
      this.hexes[bestKey].regionId = regionId;

      // Absorb neighbouring city hexes and rename them as districts
      const seedHex = this.hexes[bestKey];
      for (const [dq, dr] of NEIGHBOR_DIRS) {
        const nk = hexKey(seedHex.q + dq, seedHex.r + dr);
        if (!this.hexes[nk] || this.assigned.has(nk) || !cityHexMap.has(nk)) continue;
        cityHexMap.get(nk)!.name = seedCity.name;
        this.assigned.add(nk);
        this.hexes[nk].regionId = regionId;
        hexIds.push(nk);
      }

      // BFS-fill: claim as many additional neighbours as there are city hexes in the cluster
      let needed = hexIds.length;
      const bfsVisited = new Set<string>(hexIds);
      const bfsQueue: string[] = [...hexIds];
      let qi = 0;
      while (qi < bfsQueue.length && needed > 0) {
        const k = bfsQueue[qi++];
        const h = this.hexes[k];
        for (const [dq, dr] of NEIGHBOR_DIRS) {
          if (needed === 0) break;
          const nk = hexKey(h.q + dq, h.r + dr);
          if (!this.hexes[nk] || this.assigned.has(nk) || bfsVisited.has(nk)) continue;
          bfsVisited.add(nk);
          this.assigned.add(nk);
          this.hexes[nk].regionId = regionId;
          hexIds.push(nk);
          bfsQueue.push(nk);
          needed--;
        }
      }

      for (const k of hexIds) this.hexes[k].terrain = "city";

      this.regions[regionId] = {
        id: regionId,
        name: seedCity.name,
        regionType: "city",
        dominantTerrain: "city",
        ownerId: null,
        hexIds,
        isImpassable: false,
        rivers: [],
        cities: [],
      };
      this.regionHexCount.set(regionId, hexIds.length);
      cityRegionCount++;
    }

    this.onLog?.(`City regions: ${cityRegionCount} megacity regions seeded`);

    // ── Step 1: Land impassable clusters (attraction < 2) ─────────────────
    const impassableCandidates = new Set<string>();
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      const hex = this.hexes[k];
      if (LAND_TERRAINS.has(hex.terrain) && (hex.baseSettlerAttraction ?? 0) < 2) {
        impassableCandidates.add(k);
      }
    }

    for (const startKey of impassableCandidates) {
      if (this.assigned.has(startKey)) continue;
      const component = this.floodFill(startKey, impassableCandidates, this.assigned);
      const regionId = `impassable-land-${this.landImpassableCount++}`;
      const name = getRegionName(this.landNameIdx++);
      this.regions[regionId] = {
        id: regionId, name,
        regionType: "land",
        dominantTerrain: this.dominantTerrain(component),
        ownerId: null, hexIds: [...component],
        isImpassable: true, rivers: [], cities: [],
      };
      this.regionHexCount.set(regionId, component.length);
      for (const k of component) this.hexes[k].regionId = regionId;
    }

    // Despawn cities whose hex ended up inside a wasteland region
    let despawnedCities = 0;
    for (let i = this.cities.length - 1; i >= 0; i--) {
      const rid = this.hexes[this.cities[i].hexKey]?.regionId;
      if (rid && this.regions[rid]?.isImpassable) {
        this.cities.splice(i, 1);
        despawnedCities++;
      }
    }
    if (despawnedCities > 0) this.onLog?.(`Despawned ${despawnedCities} cities on wasteland`);

    this.onLog?.(`Land impassable clusters: ${this.landImpassableCount} regions`);

    // ── Step 1b: Mountain-range wastelands ────────────────────────────────
    this.addMountainRangeWastelands();

    // ── Step 2: Build land pool + global average attraction ──────────────
    const landPool = new Set<string>();
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      if (LAND_TERRAINS.has(this.hexes[k].terrain) && !this.assigned.has(k)) landPool.add(k);
    }

    let totalMapAttr = 0;
    let mapLandCount = 0;
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      // Exclude wasteland (already assigned) so low-attraction hexes don't drag the average down
      if (LAND_TERRAINS.has(this.hexes[k].terrain) && !this.assigned.has(k)) {
        totalMapAttr += Math.max(1, this.hexes[k].baseSettlerAttraction ?? 0);
        mapLandCount++;
      }
    }
    this.avgMapAttr = mapLandCount > 0 ? totalMapAttr / mapLandCount : 1;

    // ── Steps 3–5: Frontier-based sequential region seeding ──────────────
    // Sorted top-left first (min r, then min q) for deterministic landmass entry
    const sortedLandKeys = [...landPool].sort((a, b) => {
      const ha = this.hexes[a], hb = this.hexes[b];
      return ha.r !== hb.r ? ha.r - hb.r : ha.q - hb.q;
    });

    // Frontier: unassigned eligible hexes bordering any already-assigned land region
    const frontier = new Set<string>();

    const updateFrontier = (assignedKey: string) => {
      frontier.delete(assignedKey);
      const hex = this.hexes[assignedKey];
      for (const [dq, dr] of NEIGHBOR_DIRS) {
        const nk = hexKey(hex.q + dq, hex.r + dr);
        if (landPool.has(nk) && !this.assigned.has(nk)) frontier.add(nk);
      }
    };

    const getNextSeed = (): string | null => {
      // Prefer a frontier hex (bordering existing regions) to keep expansion contiguous
      if (frontier.size > 0) return frontier.values().next().value!;
      // No frontier → jump to the next unassigned top-left hex (new landmass)
      for (const k of sortedLandKeys) {
        if (!this.assigned.has(k)) return k;
      }
      return null;
    };

    let seedKey: string | null = sortedLandKeys.find(k => !this.assigned.has(k)) ?? null;
    let landmassCount = 0;

    while (seedKey !== null) {
      // Detect landmass transitions (frontier was empty → new landmass)
      if (frontier.size === 0) landmassCount++;

      const regionId = `region-${this.bfsCount++}`;
      const name = getRegionName(this.landNameIdx++);
      const budget = 1.5 * this.config.meanRegionSize * this.avgMapAttr;

      this.regions[regionId] = {
        id: regionId, name,
        regionType: "land",
        dominantTerrain: this.hexes[seedKey].terrain,
        ownerId: null, hexIds: [],
        isImpassable: false, rivers: [], cities: [],
      };
      this.regionHexCount.set(regionId, 0);

      // Single-source BFS up to budget
      const bfsQueue: string[] = [seedKey];
      const bfsVisited = new Set<string>([seedKey]);
      let qi = 0;
      let remaining = budget;

      while (qi < bfsQueue.length && remaining > 0) {
        const k = bfsQueue[qi++];
        if (this.assigned.has(k)) continue;

        const hexAttr = Math.max(0, this.hexes[k].baseSettlerAttraction ?? 0);
        remaining -= hexAttr;
        if (remaining < 0) break;

        this.assigned.add(k);
        this.hexes[k].regionId = regionId;
        this.regions[regionId].hexIds.push(k);
        this.regionHexCount.set(regionId, (this.regionHexCount.get(regionId) ?? 0) + 1);

        updateFrontier(k);

        const hex = this.hexes[k];
        for (const [dq, dr] of NEIGHBOR_DIRS) {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          if (landPool.has(nk) && !this.assigned.has(nk) && !bfsVisited.has(nk)) {
            bfsVisited.add(nk);
            bfsQueue.push(nk);
          }
        }
      }

      if (this.regions[regionId].hexIds.length > 0) {
        this.regions[regionId].dominantTerrain = this.dominantTerrain(this.regions[regionId].hexIds);
      }

      seedKey = getNextSeed();
    }

    this.onLog?.(`BFS complete — ${this.bfsCount} land regions across ${landmassCount} landmasses`);

    // ── Step 6: Split oversized regions ──────────────────────────────────
    this.splitOversizedRegions();

    // ── Step 7: Fix isolated regions via wasteland corridors ─────────────
    this.fixIsolatedRegions();

    // ── Step 8: Merge undersized land regions (before coast tiles absorbed) ─
    this.mergeUndersizedRegions();

    // ── Step 9: Lake and coast absorption ────────────────────────────────
    const absorbed1 = this.runAbsorption();
    this.onLog?.(`Lake & coast absorption — ${absorbed1} hexes assigned`);

    // ── Step 10: Re-run absorption for newly eligible coast/lake tiles ────
    const absorbed2 = this.runAbsorption();
    if (absorbed2 > 0) this.onLog?.(`Re-absorption pass 2 — ${absorbed2} hexes`);

    // ── Step 11: Ocean impassable regions ─────────────────────────────────
    const oceanPool = new Set<string>();
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      if (!this.assigned.has(k)) oceanPool.add(k);
    }

    const oceanVisited = new Set<string>();
    for (const startKey of oceanPool) {
      if (oceanVisited.has(startKey)) continue;
      const component = this.floodFill(startKey, oceanPool, oceanVisited);
      const regionId = `impassable-ocean-${this.oceanImpassableCount++}`;
      const name = getOceanRegionName(this.oceanNameIdx++);
      this.regions[regionId] = {
        id: regionId, name,
        regionType: "land",
        dominantTerrain: this.dominantTerrain(component),
        ownerId: null, hexIds: [...component],
        isImpassable: true, rivers: [], cities: [],
      };
      for (const k of component) {
        this.hexes[k].regionId = regionId;
        this.assigned.add(k);
      }
    }

    this.onLog?.(`Ocean impassable regions: ${this.oceanImpassableCount}`);

    const totalRegions = this.landImpassableCount + this.bfsCount + this.oceanImpassableCount;
    this.onLog?.(`Region generation done — ${totalRegions} total regions`);

    return this.regions;
  }

  // ── Absorption pass (reusable) ────────────────────────────────────────────

  private runAbsorption(): number {
    const absorbPool = new Set<string>();
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      const hex = this.hexes[k];
      if (this.assigned.has(k)) continue;
      if (hex.terrain === "lake") {
        absorbPool.add(k);
      } else if (hex.terrain === "coast") {
        const hasLandNeighbour = NEIGHBOR_DIRS.some(([dq, dr]) => {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          return this.hexes[nk] && LAND_TERRAINS.has(this.hexes[nk].terrain);
        });
        if (hasLandNeighbour) absorbPool.add(k);
      }
    }

    let absorbedCount = 0;

    // Pass 1: absorb into adjacent land-terrain region
    let absorbChanged = true;
    while (absorbChanged) {
      absorbChanged = false;
      for (const k of absorbPool) {
        if (this.assigned.has(k)) continue;
        let bestId: string | null = null;
        let bestCount = -1;
        const hex = this.hexes[k];
        for (const [dq, dr] of NEIGHBOR_DIRS) {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          const nh = this.hexes[nk];
          if (!nh || !this.assigned.has(nk) || !LAND_TERRAINS.has(nh.terrain)) continue;
          const rid = nh.regionId;
          const cnt = this.regionHexCount.get(rid) ?? 0;
          if (cnt > bestCount || (cnt === bestCount && (bestId === null || rid < bestId))) {
            bestCount = cnt; bestId = rid;
          }
        }
        if (bestId !== null) {
          this.assigned.add(k);
          this.hexes[k].regionId = bestId;
          this.regions[bestId].hexIds.push(k);
          this.regionHexCount.set(bestId, (this.regionHexCount.get(bestId) ?? 0) + 1);
          absorbedCount++;
          absorbChanged = true;
        }
      }
    }

    // Pass 2: lakes with no land neighbours → any assigned region
    absorbChanged = true;
    while (absorbChanged) {
      absorbChanged = false;
      for (const k of absorbPool) {
        if (this.assigned.has(k)) continue;
        if (this.hexes[k].terrain !== "lake") continue;
        let bestId: string | null = null;
        let bestCount = -1;
        const hex = this.hexes[k];
        for (const [dq, dr] of NEIGHBOR_DIRS) {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          if (!this.hexes[nk] || !this.assigned.has(nk)) continue;
          const rid = this.hexes[nk].regionId;
          const cnt = this.regionHexCount.get(rid) ?? 0;
          if (cnt > bestCount || (cnt === bestCount && (bestId === null || rid < bestId))) {
            bestCount = cnt; bestId = rid;
          }
        }
        if (bestId !== null) {
          this.assigned.add(k);
          this.hexes[k].regionId = bestId;
          this.regions[bestId].hexIds.push(k);
          this.regionHexCount.set(bestId, (this.regionHexCount.get(bestId) ?? 0) + 1);
          absorbedCount++;
          absorbChanged = true;
        }
      }
    }

    return absorbedCount;
  }

  // ── Mountain-range wastelands ────────────────────────────────────────────

  private addMountainRangeWastelands(): void {
    const cityKeys = new Set(this.cities.map(c => c.hexKey));

    // Unassigned, non-city mountain hexes
    const mountainPool = new Set<string>();
    for (const [q, r] of this.allCoords) {
      const k = hexKey(q, r);
      if (!this.assigned.has(k) && !cityKeys.has(k) && this.hexes[k].terrain === "mountains") {
        mountainPool.add(k);
      }
    }

    const poolVisited = new Set<string>();
    let rangeCount = 0;

    for (const startKey of mountainPool) {
      if (poolVisited.has(startKey)) continue;
      const cluster = this.floodFill(startKey, mountainPool, poolVisited);
      const lineCount = Math.floor(cluster.length / 5);
      if (lineCount === 0) continue;

      const clusterSet = new Set(cluster);
      const usedInLines = new Set<string>();

      for (let li = 0; li < lineCount; li++) {
        const available = cluster.filter(k => !usedInLines.has(k));
        if (available.length === 0) break;

        const lineStart = available[Math.floor(this.rng() * available.length)];
        const [fwdDq, fwdDr] = NEIGHBOR_DIRS[Math.floor(this.rng() * NEIGHBOR_DIRS.length)];

        const line: string[] = [lineStart];
        const lineSet = new Set<string>([lineStart]);
        for (const [dq, dr] of [[fwdDq, fwdDr], [-fwdDq, -fwdDr]] as [number, number][]) {
          let cur = lineStart;
          while (true) {
            const h = this.hexes[cur];
            const nk = hexKey(h.q + dq, h.r + dr);
            if (!clusterSet.has(nk) || lineSet.has(nk)) break;
            line.push(nk);
            lineSet.add(nk);
            cur = nk;
          }
        }

        for (const k of line) usedInLines.add(k);

        const regionId = `impassable-land-${this.landImpassableCount++}`;
        this.regions[regionId] = {
          id: regionId,
          name: getRegionName(this.landNameIdx++),
          regionType: "land",
          dominantTerrain: "mountains",
          ownerId: null,
          hexIds: [...line],
          isImpassable: true,
          rivers: [],
          cities: [],
        };
        this.regionHexCount.set(regionId, line.length);
        for (const k of line) {
          this.hexes[k].regionId = regionId;
          this.assigned.add(k);
        }
        rangeCount++;
      }
    }

    if (rangeCount > 0) this.onLog?.(`Mountain-range wastelands: ${rangeCount} new ranges`);
  }

  // ── Split oversized regions ───────────────────────────────────────────────

  private splitOversizedRegions(): void {
    const threshold = 4 * this.config.meanRegionSize;
    let splitCount = 0;
    let changed = true;

    while (changed) {
      changed = false;
      for (const [regionId, region] of Object.entries(this.regions)) {
        if (region.isImpassable || region.regionType === "city" || region.hexIds.length <= threshold) continue;

        changed = true;
        const hexSet = new Set(region.hexIds);
        const halfSize = Math.floor(region.hexIds.length / 2);

        // BFS from first hex to claim half the hexes
        const part1 = new Set<string>([region.hexIds[0]]);
        const queue = [region.hexIds[0]];
        let qi = 0;
        while (qi < queue.length && part1.size < halfSize) {
          const k = queue[qi++];
          for (const [dq, dr] of NEIGHBOR_DIRS) {
            const nk = hexKey(this.hexes[k].q + dq, this.hexes[k].r + dr);
            if (!hexSet.has(nk) || part1.has(nk)) continue;
            part1.add(nk);
            queue.push(nk);
            if (part1.size >= halfSize) break;
          }
        }

        const part2Ids = region.hexIds.filter(k => !part1.has(k));
        const part1Ids = [...part1];

        // Part2 may not be contiguous — split into connected components
        const part2Set = new Set(part2Ids);
        const part2Visited = new Set<string>();
        for (const startKey of part2Ids) {
          if (part2Visited.has(startKey)) continue;
          const component = this.floodFill(startKey, part2Set, part2Visited);
          const newRegionId = `region-${this.bfsCount++}`;
          this.regions[newRegionId] = {
            id: newRegionId, name: getRegionName(this.landNameIdx++),
            regionType: "land",
            dominantTerrain: this.dominantTerrain(component),
            ownerId: null, hexIds: component,
            isImpassable: false, rivers: [], cities: [],
          };
          this.regionHexCount.set(newRegionId, component.length);
          for (const k of component) this.hexes[k].regionId = newRegionId;
        }

        // Update existing region to part1 (always contiguous — built by BFS)
        this.regions[regionId].hexIds = part1Ids;
        this.regions[regionId].dominantTerrain = this.dominantTerrain(part1Ids);
        this.regionHexCount.set(regionId, part1.size);

        splitCount++;
        break; // restart iteration
      }
    }

    if (splitCount > 0) this.onLog?.(`Split ${splitCount} oversized regions`);
  }

  // ── Fix isolated regions via wasteland corridors ──────────────────────────

  private fixIsolatedRegions(): void {
    const nonImpassIds = Object.keys(this.regions).filter(
      id => !this.regions[id].isImpassable,
    );
    if (nonImpassIds.length <= 1) return;

    // Build adjacency graph between non-impassable regions
    const adj = new Map<string, Set<string>>();
    for (const id of nonImpassIds) adj.set(id, new Set());

    for (const id of nonImpassIds) {
      for (const k of this.regions[id].hexIds) {
        const hex = this.hexes[k];
        for (const [dq, dr] of NEIGHBOR_DIRS) {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          const nh = this.hexes[nk];
          if (!nh) continue;
          const nrid = nh.regionId;
          if (nrid === id || !adj.has(nrid)) continue;
          adj.get(id)!.add(nrid);
          adj.get(nrid)!.add(id);
        }
      }
    }

    // Find connected components
    const componentOf = new Map<string, number>();
    const components: string[][] = [];
    for (const id of nonImpassIds) {
      if (componentOf.has(id)) continue;
      const comp: string[] = [];
      const bfsQueue = [id];
      componentOf.set(id, components.length);
      let qi = 0;
      while (qi < bfsQueue.length) {
        const cur = bfsQueue[qi++];
        comp.push(cur);
        for (const nb of adj.get(cur)!) {
          if (!componentOf.has(nb)) {
            componentOf.set(nb, components.length);
            bfsQueue.push(nb);
          }
        }
      }
      components.push(comp);
    }

    if (components.length <= 1) return;

    // Main = largest component by total hex count
    const compSizes = components.map(comp =>
      comp.reduce((sum, id) => sum + (this.regionHexCount.get(id) ?? 0), 0),
    );
    const mainCompIdx = compSizes.reduce((best, sz, i) => sz > compSizes[best] ? i : best, 0);

    // Land-based wasteland hexes (impassable-land regions)
    const wastelandHexes = new Set<string>();
    for (const [id, region] of Object.entries(this.regions)) {
      if (region.isImpassable && !RegionGenerator.isOceanImpassable(region)) {
        for (const k of region.hexIds) wastelandHexes.add(k);
      }
    }

    // Main region ID set (grows as we connect more components)
    const mainRegionIds = new Set(components[mainCompIdx]);
    let corridorCount = 0;

    // Multi-pass: retry failed components after others have been connected (relay connections)
    let anyConnected = true;
    while (anyConnected) {
      anyConnected = false;

    for (let ci = 0; ci < components.length; ci++) {
      if (ci === mainCompIdx) continue;
      const isoComp = components[ci];
      if (isoComp.every(rid => mainRegionIds.has(rid))) continue; // already connected

      // BFS through wasteland from boundary hexes of isolated component
      // Maps wasteland hexKey → { prev: previous wasteland key or null, srcRegion: isolated region id }
      const visited = new Map<string, { prev: string | null; srcRegion: string }>();
      const bfsQueue: string[] = [];

      for (const rid of isoComp) {
        for (const k of this.regions[rid].hexIds) {
          const hex = this.hexes[k];
          for (const [dq, dr] of NEIGHBOR_DIRS) {
            const nk = hexKey(hex.q + dq, hex.r + dr);
            if (!wastelandHexes.has(nk) || visited.has(nk)) continue;
            visited.set(nk, { prev: null, srcRegion: rid });
            bfsQueue.push(nk);
          }
        }
      }

      let foundKey: string | null = null;
      let foundSrcRegion: string | null = null;
      let qi = 0;

      outer: while (qi < bfsQueue.length) {
        const k = bfsQueue[qi++];
        const hex = this.hexes[k];

        for (const [dq, dr] of NEIGHBOR_DIRS) {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          const nh = this.hexes[nk];
          if (!nh || !mainRegionIds.has(nh.regionId)) continue;
          foundKey = k;
          foundSrcRegion = visited.get(k)!.srcRegion;
          break outer;
        }

        for (const [dq, dr] of NEIGHBOR_DIRS) {
          const nk = hexKey(hex.q + dq, hex.r + dr);
          if (!wastelandHexes.has(nk) || visited.has(nk)) continue;
          visited.set(nk, { prev: k, srcRegion: visited.get(k)!.srcRegion });
          bfsQueue.push(nk);
        }
      }

      if (foundKey === null || foundSrcRegion === null) continue;

      // Reconstruct path of wasteland hexes from foundKey back to start
      const path: string[] = [];
      let cur: string | null = foundKey;
      while (cur !== null) {
        path.push(cur);
        cur = visited.get(cur)?.prev ?? null;
      }

      // Track wasteland regions that will lose hexes
      const affectedWastelandRegions = new Set<string>();
      for (const pk of path) affectedWastelandRegions.add(this.hexes[pk].regionId);

      // Reassign corridor hexes to the isolated region
      const targetRegionId = foundSrcRegion;
      for (const pk of path) {
        this.hexes[pk].regionId = targetRegionId;
        this.regions[targetRegionId].hexIds.push(pk);
        this.regionHexCount.set(targetRegionId, (this.regionHexCount.get(targetRegionId) ?? 0) + 1);
        wastelandHexes.delete(pk);
      }

      // Expand the corridor region into adjacent wasteland up to its computed budget
      const targetRegion = this.regions[targetRegionId];
      let totalRegionAttr = 0;
      for (const k of targetRegion.hexIds) {
        totalRegionAttr += Math.max(1, this.hexes[k].baseSettlerAttraction ?? 0);
      }
      const localAttr = totalRegionAttr / targetRegion.hexIds.length;
      const budget = Math.max(1, Math.round(
        2 * this.config.meanRegionSize * (this.avgMapAttr / (localAttr + this.avgMapAttr)),
      ));
      let needed = Math.max(0, budget - targetRegion.hexIds.length);

      if (needed > 0) {
        const expVisited = new Set<string>();
        const expQueue: string[] = [];
        for (const k of targetRegion.hexIds) {
          const hex = this.hexes[k];
          for (const [dq, dr] of NEIGHBOR_DIRS) {
            const nk = hexKey(hex.q + dq, hex.r + dr);
            if (wastelandHexes.has(nk) && !expVisited.has(nk)) {
              expVisited.add(nk);
              expQueue.push(nk);
            }
          }
        }
        let eqi = 0;
        while (eqi < expQueue.length && needed > 0) {
          const k = expQueue[eqi++];
          if (!wastelandHexes.has(k)) continue;
          affectedWastelandRegions.add(this.hexes[k].regionId);
          wastelandHexes.delete(k);
          this.hexes[k].regionId = targetRegionId;
          targetRegion.hexIds.push(k);
          this.regionHexCount.set(targetRegionId, (this.regionHexCount.get(targetRegionId) ?? 0) + 1);
          needed--;
          const hex = this.hexes[k];
          for (const [dq, dr] of NEIGHBOR_DIRS) {
            const nk = hexKey(hex.q + dq, hex.r + dr);
            if (wastelandHexes.has(nk) && !expVisited.has(nk)) {
              expVisited.add(nk);
              expQueue.push(nk);
            }
          }
        }
      }

      // Rebuild hexIds for affected wasteland regions
      for (const rid of affectedWastelandRegions) {
        this.regions[rid].hexIds = this.regions[rid].hexIds.filter(k => this.hexes[k].regionId === rid);
        this.regionHexCount.set(rid, this.regions[rid].hexIds.length);
      }

      this.regions[targetRegionId].dominantTerrain = this.dominantTerrain(
        this.regions[targetRegionId].hexIds,
      );

      // Mark this component as reachable for subsequent isolated components
      for (const rid of isoComp) mainRegionIds.add(rid);
      corridorCount++;
      anyConnected = true;
    }

    } // end multi-pass while

    if (corridorCount > 0) this.onLog?.(`Fixed ${corridorCount} isolated region groups via wasteland corridors`);
  }

  // ── Merge undersized land regions ────────────────────────────────────────

  private mergeUndersizedRegions(): void {
    const minSize = this.config.meanRegionSize / 3;
    let mergeCount = 0;
    let changed = true;

    while (changed) {
      changed = false;

      for (const [regionId, region] of Object.entries(this.regions)) {
        if (region.isImpassable || region.regionType === "city") continue;
        if (region.hexIds.length >= minSize) continue;

        // Find smallest neighbouring non-impassable region
        const neighbourSizes = new Map<string, number>();
        for (const k of region.hexIds) {
          const hex = this.hexes[k];
          for (const [dq, dr] of NEIGHBOR_DIRS) {
            const nk = hexKey(hex.q + dq, hex.r + dr);
            const nh = this.hexes[nk];
            if (!nh) continue;
            const nrid = nh.regionId;
            if (!nrid || nrid === regionId) continue;
            const nr = this.regions[nrid];
            if (!nr || nr.isImpassable) continue;
            neighbourSizes.set(nrid, this.regionHexCount.get(nrid) ?? 0);
          }
        }

        if (neighbourSizes.size === 0) continue;

        let targetId: string | null = null;
        let targetSize = Infinity;
        for (const [nrid, sz] of neighbourSizes) {
          if (sz < targetSize || (sz === targetSize && (targetId === null || nrid < targetId))) {
            targetSize = sz; targetId = nrid;
          }
        }

        if (targetId === null) continue;

        // Absorb this region into targetId
        for (const k of region.hexIds) {
          this.hexes[k].regionId = targetId;
          this.regions[targetId].hexIds.push(k);
        }
        this.regionHexCount.set(targetId, (this.regionHexCount.get(targetId) ?? 0) + region.hexIds.length);
        this.regions[targetId].dominantTerrain = this.dominantTerrain(this.regions[targetId].hexIds);
        delete this.regions[regionId];
        this.regionHexCount.delete(regionId);

        mergeCount++;
        changed = true;
        break; // restart after each merge
      }
    }

    if (mergeCount > 0) this.onLog?.(`Merged ${mergeCount} undersized land regions`);
  }

  // ── Static helper for rendering ───────────────────────────────────────────

  static isOceanImpassable(region: Region): boolean {
    return region.isImpassable && OCEAN_DOM_TERRAINS.has(region.dominantTerrain);
  }
}
