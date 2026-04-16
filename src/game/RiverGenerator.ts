import type { WorldConfig, Hex, Terrain, River } from "../types/world";
import { rngInt, rngPick, rngShuffle } from "./rng";
import { hexKey, hexNeighbors, hexCornerTriplets, adjacentCornerTriplets } from "./hexMath";

// Terrain height values used for river descent scoring (lower = more downhill)
const TERRAIN_HEIGHT: Record<Terrain, number> = {
  mountains: 7,
  hills: 4,
  plains: 1,
  lake: 2,
  forest: 1,
  desert: 1,
  coast: 1,
  water: -1,
};

export class RiverGenerator {
  private cornerMap = new Map<string, [string, string, string]>();
  private allRiverCorners = new Set<string>();
  private rivers: River[] = [];

  constructor(
    private readonly hexes: Record<string, Hex>,
    private readonly coordSet: Set<string>,
    private readonly allCoords: [number, number][],
    private readonly config: WorldConfig,
    private readonly rng: () => number,
    private readonly onLog?: (msg: string) => void,
  ) {}

  generate(): River[] {
    this.onLog?.("Starting river generation");
    this.buildCornerMap();
    this.generateForLandmasses();
    this.classifyLarge();
    this.classifyVeryLarge();
    return this.rivers;
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  private buildCornerMap(): void {
    for (const [q, r] of this.allCoords) {
      for (const triplet of hexCornerTriplets(q, r)) {
        const key = triplet.join("|");
        if (!this.cornerMap.has(key)) this.cornerMap.set(key, triplet);
      }
    }
  }

  private getTerrain = (k: string): Terrain => this.hexes[k]?.terrain ?? "water";
  private isSource = (t: Terrain) => t === "mountains" || t === "hills" || t === "lake";
  private isTerminal = (t: Terrain) => t === "water" || t === "lake";

  // ─── Main Generation ────────────────────────────────────────────────────────

  private generateForLandmasses(): void {
    const { minLandmassForRiver, hexesPerRiver } = this.config;

    // Find connected landmasses (for minLandmassForRiver gate)
    const globalVisited = new Set<string>();
    const landmasses: [number, number][][] = [];

    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      if (globalVisited.has(key)) continue;
      const terrain = this.hexes[key].terrain;
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
          if (globalVisited.has(nKey) || !this.coordSet.has(nKey)) continue;
          const nt = this.hexes[nKey].terrain;
          if (nt !== "water" && nt !== "lake") {
            globalVisited.add(nKey);
            queue.push([nq, nr]);
          }
        }
      }
      landmasses.push(mass);
    }

    for (const mass of landmasses) {
      if (mass.length < minLandmassForRiver) continue;

      const targetCount = Math.max(1, Math.floor(mass.length / hexesPerRiver));

      // Collect valid start corners: touch a source terrain, not already on a river
      const massKeySet = new Set(mass.map(([q, r]) => hexKey(q, r)));
      const candidates: string[] = [];

      for (const [ck, hexKeys] of this.cornerMap) {
        if (this.allRiverCorners.has(ck)) continue;
        if (!hexKeys.some((k) => massKeySet.has(k))) continue;
        if (!hexKeys.some((k) => this.isSource(this.getTerrain(k)))) continue;
        candidates.push(ck);
      }

      const shuffled = rngShuffle(this.rng, candidates);
      let startIdx = 0;
      let riversForMass = 0;

      while (riversForMass < targetCount && startIdx < shuffled.length) {
        const startKey = shuffled[startIdx++];
        if (this.allRiverCorners.has(startKey)) continue;

        const { corners, loopedAt } = this.traceRiverCorners(startKey);

        if (loopedAt) {
          this.handleLoopLake(loopedAt, 1);
        }

        if (corners.length >= 3 && this.validateRiver(corners)) {
          this.commitRiver(corners);
          riversForMass++;

          // Lake outlet: if river ended in a lake, 80% chance to spawn another
          const lastKey = corners[corners.length - 1];
          const lastHexes = this.cornerMap.get(lastKey);
          const endsInLake = lastHexes?.some((k) => this.getTerrain(k) === "lake") ?? false;
          if (endsInLake && this.rng() < 0.8) {
            const lakeHex = lastHexes!.find((k) => this.getTerrain(k) === "lake")!;
            this.spawnLakeOutlet(lakeHex, 1);
          }
        }
      }
    }
  }

  // ─── Size Classification ────────────────────────────────────────────────────

  private classifyLarge(): void {
    // Build index: cornerKey → river indices whose last corner is that key
    const terminalCorners = new Map<string, number[]>();
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const lastCorner = this.rivers[ri].corners[this.rivers[ri].corners.length - 1];
      if (!terminalCorners.has(lastCorner)) terminalCorners.set(lastCorner, []);
      terminalCorners.get(lastCorner)!.push(ri);
    }

    for (let ri = 0; ri < this.rivers.length; ri++) {
      const river = this.rivers[ri];

      // Rule 1: lake source — first corner touches a lake hex
      const firstHexes = this.cornerMap.get(river.corners[0]);
      if (firstHexes?.some((k) => this.getTerrain(k) === "lake")) {
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

    // Store for reuse in classifyVeryLarge
    this._terminalCorners = terminalCorners;
  }

  private _terminalCorners = new Map<string, number[]>();

  private classifyVeryLarge(): void {
    // A large river that receives a second tributary junction becomes very large
    for (let ri = 0; ri < this.rivers.length; ri++) {
      const river = this.rivers[ri];
      if (river.largeFromIndex === undefined) continue;

      for (let ci = river.largeFromIndex + 1; ci < river.corners.length; ci++) {
        const tributaries = this._terminalCorners.get(river.corners[ci]);
        if (tributaries && tributaries.some((tri) => tri !== ri)) {
          river.veryLargeFromIndex = ci;
          break;
        }
      }
    }
  }

  // ─── River Tracing ──────────────────────────────────────────────────────────

  private traceRiverCorners(
    startKey: string,
    originLakeKeys?: Set<string>,
  ): { corners: string[]; loopedAt?: string } {
    const corners: string[] = [startKey];
    const visited = new Set<string>([startKey]);
    let currentKey = startKey;
    let loopedAt: string | undefined;

    while (corners.length < 300) {
      const currentHexes = this.cornerMap.get(currentKey);
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

      // Exclude steps where either shared hex is water or lake
      const currentHexSet = new Set(currentHexes);
      const nonInterior = nonCyclic.filter((a) => {
        const shared = a.hexKeys.filter((k) => currentHexSet.has(k));
        return shared.every((k) => {
          const t = this.getTerrain(k);
          return t !== "water" && t !== "lake";
        });
      });

      if (nonInterior.length === 0) break;

      // Terminate: any neighbor touches water or lake (ignoring origin lake)
      const terminals = nonInterior.filter((a) =>
        a.hexKeys.some(
          (k) => this.isTerminal(this.getTerrain(k)) && !originLakeKeys?.has(k),
        ),
      );
      if (terminals.length > 0) {
        corners.push(rngPick(this.rng, terminals).key);
        break;
      }

      // Terminate: any neighbor is already on another river (tributary junction)
      const junctions = nonInterior.filter((a) => this.allRiverCorners.has(a.key));
      if (junctions.length > 0) {
        corners.push(rngPick(this.rng, junctions).key);
        break;
      }

      // Normal step: terrain-descent bias
      const scored = nonInterior.map((c) => ({
        c,
        score: this.cornerScore(c.key),
      }));
      const minScore = Math.min(...scored.map((s) => s.score));
      const downhill = scored.filter((s) => s.score === minScore).map((s) => s.c);
      const next = rngPick(this.rng, downhill);
      corners.push(next.key);
      visited.add(next.key);
      currentKey = next.key;
    }

    return { corners, loopedAt };
  }

  // Score a corner by summing terrain heights of its 3 adjacent hexes, their
  // ring-1 neighbors, and ring-2 neighbors. Off-grid hexes contribute 0.
  private cornerScore(cornerKey: string): number {
    const triplet = this.cornerMap.get(cornerKey);
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
      for (const [nq, nr] of hexNeighbors(q, r)) zone.add(hexKey(nq, nr));
    }

    let score = 0;
    for (const hk of zone) score += TERRAIN_HEIGHT[this.getTerrain(hk)] ?? 0;
    return score;
  }

  // ─── River Commit ────────────────────────────────────────────────────────────

  private commitRiver(corners: string[]): void {
    for (const ck of corners) this.allRiverCorners.add(ck);
    const id = `river_${this.rivers.length}`;
    this.rivers.push({ id, corners });

    if (this.onLog) {
      const segments = corners.length - 1;
      const lastHexes = this.cornerMap.get(corners[corners.length - 1]);
      const drain = lastHexes?.some((k) => this.getTerrain(k) === "lake")
        ? "lake"
        : "sea";
      this.onLog(`River #${this.rivers.length} placed — ${segments} segments, drains to ${drain}`);
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  private validateRiver(corners: string[], originLakeKeys?: Set<string>): boolean {
    const segments = corners.length - 1;

    // Rule 1: max length = (width + height) / 3
    if (segments > (this.config.width + this.config.height) / 3) return false;

    // Rule 2: no corner may have 2+ adjacent hexes that are water or lake
    for (const ck of corners) {
      const hexKeys = this.cornerMap.get(ck);
      if (!hexKeys) continue;
      const waterCount = hexKeys.filter((k) => {
        const t = this.getTerrain(k);
        return t === "water" || t === "lake";
      }).length;
      if (waterCount >= 2) return false;
    }

    // Rule 3: river can't drain to the lake it started from
    const firstHexes = this.cornerMap.get(corners[0]);
    const lastHexes = this.cornerMap.get(corners[corners.length - 1]);
    const endLakeHex = lastHexes?.find((k) => this.getTerrain(k) === "lake");

    if (endLakeHex) {
      if (originLakeKeys?.has(endLakeHex)) return false;

      const startLakeHex = firstHexes?.find((k) => this.getTerrain(k) === "lake");
      if (startLakeHex) {
        const startLakeGroup = this.floodFillLake(startLakeHex);
        if (startLakeGroup.has(endLakeHex)) return false;
      }
    }

    // Rule 4: unique hexes touched must be >=  segments
    const uniqueHexes = new Set<string>();
    for (const ck of corners) {
      const hexKeys = this.cornerMap.get(ck);
      if (hexKeys) for (const k of hexKeys) uniqueHexes.add(k);
    }
    if (uniqueHexes.size < segments) return false;

    return true;
  }

  private floodFillLake(startKey: string): Set<string> {
    const group = new Set<string>([startKey]);
    const queue: string[] = [startKey];
    let qi = 0;
    while (qi < queue.length) {
      const key = queue[qi++];
      const sep = key.indexOf(",");
      const q = parseInt(key.slice(0, sep), 10);
      const r = parseInt(key.slice(sep + 1), 10);
      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (!group.has(nKey) && this.getTerrain(nKey) === "lake") {
          group.add(nKey);
          queue.push(nKey);
        }
      }
    }
    return group;
  }

  // ─── Lake Helpers ────────────────────────────────────────────────────────────

  // Spawn a river outlet from a lake group, with chained outlets up to depth 5.
  private spawnLakeOutlet(lakeHexKey: string, chainDepth: number): void {
    if (chainDepth > 5) return;

    // Flood-fill the connected lake group
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
        if (!lakeGroup.has(nKey) && this.getTerrain(nKey) === "lake") {
          lakeGroup.add(nKey);
          lakeQueue.push(nKey);
        }
      }
    }

    // Preferred: corners touching 2+ lake hexes. Fallback: exactly 1.
    const preferred: string[] = [];
    const fallback: string[] = [];
    for (const [ck, hexKeys] of this.cornerMap) {
      if (this.allRiverCorners.has(ck)) continue;
      const lakeCount = hexKeys.filter((k) => lakeGroup.has(k)).length;
      if (lakeCount >= 2) preferred.push(ck);
      else if (lakeCount === 1) fallback.push(ck);
    }

    const candidates = [
      ...rngShuffle(this.rng, preferred),
      ...rngShuffle(this.rng, fallback),
    ];

    for (const startKey of candidates) {
      if (this.allRiverCorners.has(startKey)) continue;

      const { corners, loopedAt } = this.traceRiverCorners(startKey, lakeGroup);

      if (loopedAt) this.handleLoopLake(loopedAt, chainDepth + 1);

      if (corners.length >= 3 && this.validateRiver(corners, lakeGroup)) {
        this.commitRiver(corners);

        const lastKey = corners[corners.length - 1];
        const lastHexes = this.cornerMap.get(lastKey);
        const outletEndsInLake =
          lastHexes?.some((k) => this.getTerrain(k) === "lake") ?? false;
        if (outletEndsInLake && this.rng() < 0.8) {
          const nextLakeHex = lastHexes!.find((k) => this.getTerrain(k) === "lake")!;
          this.spawnLakeOutlet(nextLakeHex, chainDepth + 1);
        }
        break; // one outlet per lake group per invocation
      }
    }
  }

  // When a river loops back on itself, convert 1–3 adjacent land hexes to lake
  // and spawn an outlet river from the new lake.
  private handleLoopLake(loopedAt: string, chainDepth: number): void {
    if (chainDepth > 5) return;

    const triplet = this.cornerMap.get(loopedAt);
    if (!triplet) return;

    const landHexes = triplet.filter((k) => {
      const t = this.getTerrain(k);
      return t !== "water" && t !== "lake";
    });
    if (landHexes.length === 0) return;

    const count = rngInt(this.rng, 1, Math.min(3, landHexes.length));
    const shuffled = rngShuffle(this.rng, [...landHexes]);
    const newLakeHexes = shuffled.slice(0, count);

    for (const k of newLakeHexes) {
      if (this.hexes[k]) {
        this.hexes[k].terrain = "lake";
        this.hexes[k].regionId = "water";
      }
    }

    this.spawnLakeOutlet(newLakeHexes[0], chainDepth);
  }
}
