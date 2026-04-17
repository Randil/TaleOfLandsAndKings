import type { WorldConfig, Hex, City } from "../types/world";
import { hexKey, hexesInRadius } from "./hexMath";
import { getCityName } from "./cityNames";

// Precomputed offsets for rings 1–4 with their distances
const RING_OFFSETS: { dq: number; dr: number; dist: number }[] = hexesInRadius(4)
  .filter(([dq, dr]) => dq !== 0 || dr !== 0)
  .map(([dq, dr]) => ({
    dq,
    dr,
    dist: (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2,
  }))
  .filter(({ dist }) => dist <= 4);

const RING_DELTA: Record<number, number> = { 1: -8, 2: -6, 3: -4, 4: -2 };

export class CityGenerator {
  constructor(
    private readonly config: WorldConfig,
    private readonly hexes: Record<string, Hex>,
    private readonly allCoords: [number, number][],
    private readonly coordSet: Set<string>,
    private readonly onLog?: (msg: string) => void,
  ) {}

  generate(): City[] {
    const cityCount = Math.ceil(this.allCoords.length / this.config.hexesPerCity);
    this.onLog?.(`CityGenerator: placing ${cityCount} cities`);

    const cities: City[] = [];

    for (let i = 0; i < cityCount; i++) {
      // Find highest currentSettlerAttraction hex
      let bestKey: string | null = null;
      let bestScore = -Infinity;
      for (const [q, r] of this.allCoords) {
        const k = hexKey(q, r);
        const score = this.hexes[k].currentSettlerAttraction ?? -100;
        if (score > -100 && score > bestScore) {
          bestScore = score;
          bestKey = k;
        }
      }
      if (bestKey === null) break;

      const hex = this.hexes[bestKey];
      const city: City = {
        id: `city-${i}`,
        hexKey: bestKey,
        name: getCityName(i),
      };
      cities.push(city);

      // Mark city tile ineligible
      hex.currentSettlerAttraction = -100;

      // Apply ring decay
      const [q, r] = [hex.q, hex.r];
      for (const { dq, dr, dist } of RING_OFFSETS) {
        const nk = hexKey(q + dq, r + dr);
        if (!this.coordSet.has(nk)) continue;
        const nhex = this.hexes[nk];
        if (nhex.currentSettlerAttraction === -100) continue;
        nhex.currentSettlerAttraction = Math.max(
          -100,
          (nhex.currentSettlerAttraction ?? 0) + RING_DELTA[dist],
        );
      }
    }

    this.onLog?.(`CityGenerator: done — ${cities.length} cities placed`);
    return cities;
  }
}
