import type { WorldConfig, Hex } from "../types/world";
import { hexKey, hexNeighbors } from "./hexMath";

export class FertilityGenerator {
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
    const fertilityMap = new Map<string, number>();

    this.onLog?.("Fertility: climate base");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const climate = this.hexes[key].climate ?? 6;
      fertilityMap.set(key, 5 - Math.abs(6 - climate));
    }

    this.onLog?.("Fertility: ocean bonus");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const hex = this.hexes[key];
      if (hex.terrain === "water" && (hex.climate ?? 6) <= 3) {
        fertilityMap.set(key, fertilityMap.get(key)! + 2);
      }
    }

    this.onLog?.("Fertility: coast bonus");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const hex = this.hexes[key];
      if (hex.terrain === "coast") {
        const climate = hex.climate ?? 6;
        fertilityMap.set(key, fertilityMap.get(key)! + 1 + (climate <= 3 ? 1 : 0));
      }
    }

    this.onLog?.("Fertility: river adjacency");
    const veryLargeRiverHexes = new Set<string>();
    for (const [q, r] of this.allCoords) {
      if (this.hexes[hexKey(q, r)].riverSize === "veryLarge") {
        veryLargeRiverHexes.add(hexKey(q, r));
      }
    }
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const rs = this.hexes[key].riverSize;
      if (rs === "large" || rs === "veryLarge") {
        fertilityMap.set(key, fertilityMap.get(key)! + 2);
      } else if (rs === "small") {
        fertilityMap.set(key, fertilityMap.get(key)! + 1);
      } else {
        const hasVeryLargeNeighbor = hexNeighbors(q, r).some(([nq, nr]) =>
          veryLargeRiverHexes.has(hexKey(nq, nr)),
        );
        if (hasVeryLargeNeighbor) {
          fertilityMap.set(key, fertilityMap.get(key)! + 1);
        }
      }
    }

    this.onLog?.("Fertility: lake bonus");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      if (this.hexes[key].terrain === "lake") {
        fertilityMap.set(key, fertilityMap.get(key)! + 3);
      }
    }

    this.onLog?.("Fertility: mountain penalty");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      if (this.hexes[key].terrain === "mountains") {
        fertilityMap.set(key, fertilityMap.get(key)! - 3);
      }
    }

    this.onLog?.("Fertility: hot climate freshwater bonus");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const climate = this.hexes[key].climate ?? 6;
      if (climate < 7) continue;
      const hasFreshwater =
        this.hexes[key].riverSize !== undefined ||
        hexNeighbors(q, r).some(([nq, nr]) => this.hexes[hexKey(nq, nr)]?.terrain === "lake");
      if (!hasFreshwater) continue;
      fertilityMap.set(key, fertilityMap.get(key)! + (climate >= 9 ? 3 : 1));
    }

    this.onLog?.("Fertility: spawning random zones");
    this.spawnZones(fertilityMap);

    this.onLog?.("Fertility: applying floor");
    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const terrain = this.hexes[key].terrain;
      const floor = terrain === "water" || terrain === "coast" ? 2 : 0;
      const value = Math.max(floor, fertilityMap.get(key)!);
      this.hexes[key].baseFertility = value;
      this.hexes[key].currentFertility = value;
    }

    this.onLog?.("Fertility: done");
  }

  private spawnZones(fertilityMap: Map<string, number>): void {
    const landCoords = this.allCoords.filter(([q, r]) => {
      const t = this.hexes[hexKey(q, r)].terrain;
      return t !== "water" && t !== "coast";
    });
    for (let i = 0; i < 20; i++) this.spawnZone(+1, fertilityMap, landCoords);
    for (let i = 0; i < 20; i++) this.spawnZone(-1, fertilityMap);
  }

  private spawnZone(delta: number, fertilityMap: Map<string, number>, seedPool = this.allCoords): void {
    const idx = Math.floor(this.rng() * seedPool.length);
    const [seedQ, seedR] = seedPool[idx];
    const targetSize = Math.max(
      1,
      Math.floor(this.totalHexes * (0.02 + this.rng() * 0.03)),
    );
    this.growZone(seedQ, seedR, targetSize, delta, fertilityMap);
  }

  private growZone(
    seedQ: number,
    seedR: number,
    targetSize: number,
    delta: number,
    fertilityMap: Map<string, number>,
  ): void {
    const seedKey = hexKey(seedQ, seedR);
    const frontier: [number, number][] = [[seedQ, seedR]];
    const inZone = new Set<string>([seedKey]);
    fertilityMap.set(seedKey, fertilityMap.get(seedKey)! + delta);

    while (inZone.size < targetSize && frontier.length > 0) {
      const idx = Math.floor(this.rng() * frontier.length);
      const [q, r] = frontier[idx];
      frontier.splice(idx, 1);

      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (this.coordSet.has(nKey) && !inZone.has(nKey)) {
          inZone.add(nKey);
          frontier.push([nq, nr]);
          fertilityMap.set(nKey, fertilityMap.get(nKey)! + delta);
          if (inZone.size >= targetSize) return;
        }
      }
    }
  }
}
