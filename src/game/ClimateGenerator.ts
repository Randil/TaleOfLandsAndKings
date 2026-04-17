import type { WorldConfig, Hex, Terrain } from "../types/world";
import { hexKey, hexNeighbors } from "./hexMath";

const ELEVATION_DELTA: Partial<Record<Terrain, number>> = {
  hills: -1,
  mountains: -2,
};

export class ClimateGenerator {
  private readonly totalHexes: number;

  constructor(
    private readonly config: WorldConfig,
    private readonly hexes: Record<string, Hex>,
    private readonly allCoords: [number, number][],
    private readonly coordSet: Set<string>,
    private readonly rng: () => number,
    private readonly onLog?: (msg: string) => void,
  ) {
    this.totalHexes = allCoords.length;
  }

  generate(): void {
    const { height } = this.config;
    const beltHeight = Math.floor(height / 10);
    const remainder = height % 10;
    const climateMap = new Map<string, number>();

    this.onLog?.("Climate: assigning belt values");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const visualRow = r + Math.floor(q / 2);
      climateMap.set(key, this.getBelt(visualRow, beltHeight, remainder));
    }

    this.onLog?.("Climate: applying sea moderation");
    this.applySeaModeration(climateMap, beltHeight, remainder);

    this.onLog?.("Climate: applying elevation effects");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const delta = ELEVATION_DELTA[this.hexes[key].terrain] ?? 0;
      if (delta !== 0) climateMap.set(key, climateMap.get(key)! + delta);
    }

    this.onLog?.("Climate: spawning extreme climate fields");
    this.spawnExtremeFields(climateMap, beltHeight, remainder);

    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      this.hexes[key].climate = Math.min(10, Math.max(1, climateMap.get(key)!));
    }

    this.onLog?.("Climate: done");
  }

  private getBelt(visualRow: number, beltHeight: number, remainder: number): number {
    if (beltHeight === 0) return 6;
    const belt6Start = 5 * beltHeight;
    const belt6End = 6 * beltHeight + remainder - 1;
    if (visualRow < belt6Start) return Math.floor(visualRow / beltHeight) + 1;
    if (visualRow <= belt6End) return 6;
    return Math.floor((visualRow - remainder) / beltHeight) + 1;
  }

  private applySeaModeration(
    climateMap: Map<string, number>,
    beltHeight: number,
    remainder: number,
  ): void {
    const seaKeys = new Set<string>();

    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      if (this.hexes[key].terrain !== "water") continue;
      seaKeys.add(key);
      const belt = this.getBelt(r + Math.floor(q / 2), beltHeight, remainder);
      const delta = belt <= 3 ? 1 : belt >= 8 ? -1 : 0;
      if (delta !== 0) climateMap.set(key, climateMap.get(key)! + delta);
    }

    // Collect land hexes within 2 steps of any sea tile
    const ring1 = new Set<string>();
    for (const seaKey of seaKeys) {
      const [q, r] = seaKey.split(",").map(Number);
      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (this.coordSet.has(nKey) && !seaKeys.has(nKey)) ring1.add(nKey);
      }
    }

    const ring2 = new Set<string>();
    for (const r1Key of ring1) {
      const [q, r] = r1Key.split(",").map(Number);
      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (this.coordSet.has(nKey) && !seaKeys.has(nKey) && !ring1.has(nKey)) {
          ring2.add(nKey);
        }
      }
    }

    for (const key of [...ring1, ...ring2]) {
      const climate = climateMap.get(key)!;
      if (climate < 5) climateMap.set(key, climate + 1);
      else if (climate > 6) climateMap.set(key, climate - 1);
    }
  }

  private spawnExtremeFields(
    climateMap: Map<string, number>,
    beltHeight: number,
    remainder: number,
  ): void {
    const hexesByBelt: Map<number, string[]> = new Map();
    for (let b = 1; b <= 10; b++) hexesByBelt.set(b, []);

    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const belt = this.getBelt(r + Math.floor(q / 2), beltHeight, remainder);
      hexesByBelt.get(belt)!.push(key);
    }

    const fromBelts = (belts: number[], filter?: (k: string) => boolean): string[] => {
      const result: string[] = [];
      for (const b of belts) {
        for (const k of hexesByBelt.get(b)!) {
          if (!filter || filter(k)) result.push(k);
        }
      }
      return result;
    };

    const isWater = (k: string) => this.hexes[k].terrain === "water";
    const isLand = (k: string) => !isWater(k);

    this.trySpawnField(fromBelts([1, 2], isWater), +1, climateMap);
    this.trySpawnField(fromBelts([1, 2], isLand), -1, climateMap);

    this.trySpawnField(fromBelts([4, 5, 6, 7]), +1, climateMap);
    this.trySpawnField(fromBelts([4, 5, 6, 7]), +1, climateMap);
    this.trySpawnField(fromBelts([4, 5, 6, 7]), -1, climateMap);
    this.trySpawnField(fromBelts([4, 5, 6, 7]), -1, climateMap);

    this.trySpawnField(fromBelts([9, 10], isLand), +1, climateMap);
    this.trySpawnField(fromBelts([9, 10], isWater), -1, climateMap);
  }

  private trySpawnField(
    candidates: string[],
    delta: number,
    climateMap: Map<string, number>,
  ): void {
    if (candidates.length === 0) return;
    const seedKey = candidates[Math.floor(this.rng() * candidates.length)];
    const targetSize = Math.max(1, Math.floor(this.totalHexes * (0.03 + this.rng() * 0.05)));
    const [seedQ, seedR] = seedKey.split(",").map(Number);
    this.growField(seedQ, seedR, targetSize, delta, climateMap);
  }

  private growField(
    seedQ: number,
    seedR: number,
    targetSize: number,
    delta: number,
    climateMap: Map<string, number>,
  ): void {
    const seedKey = hexKey(seedQ, seedR);
    const frontier: [number, number][] = [[seedQ, seedR]];
    const inField = new Set<string>([seedKey]);
    climateMap.set(seedKey, climateMap.get(seedKey)! + delta);

    while (inField.size < targetSize && frontier.length > 0) {
      const idx = Math.floor(this.rng() * frontier.length);
      const [q, r] = frontier[idx];
      frontier.splice(idx, 1);

      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (this.coordSet.has(nKey) && !inField.has(nKey)) {
          inField.add(nKey);
          frontier.push([nq, nr]);
          climateMap.set(nKey, climateMap.get(nKey)! + delta);
          if (inField.size >= targetSize) return;
        }
      }
    }
  }
}
