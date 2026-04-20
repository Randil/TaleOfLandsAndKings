import type { Region } from "../types/world";
import type { Hex, City } from "../types/world";
import { hexKey, NEIGHBOR_DIRS } from "./hexMath";
import { rngShuffle } from "./rng";
import type { RNG } from "./rng";
import { RESOURCE_BY_ID } from "./resources";

export class EconomyGenerator {
  constructor(
    private hexes: Record<string, Hex>,
    private regions: Record<string, Region>,
    private cities: City[],
    private rng: RNG,
    private onLog?: (msg: string) => void,
  ) {}

  generate(): void {
    this.seedDevelopment();
    this.seedPopulation();
    this.seedWealth();
    this.onLog?.("Economy seeded — development, population, wealth");
  }

  private seedDevelopment(): void {
    for (const region of Object.values(this.regions)) {
      region.development = region.isImpassable ? 0 : 1;
    }

    for (const city of this.cities) {
      const hex = this.hexes[city.hexKey];
      if (!hex) continue;
      const region = this.regions[hex.regionId];
      if (region && !region.isImpassable) region.development += 1;
    }

    for (const region of Object.values(this.regions)) {
      if (region.regionType === "city") region.development += 3;
    }

    const passableRegions = Object.values(this.regions).filter((r) => !r.isImpassable);
    const capitalCount = Math.floor(passableRegions.length / 30);

    if (capitalCount === 0) return;

    const cityRegionIds = new Set<string>();
    for (const city of this.cities) {
      const hex = this.hexes[city.hexKey];
      if (hex) cityRegionIds.add(hex.regionId);
    }

    const candidates = rngShuffle(
      this.rng,
      passableRegions.filter((r) => cityRegionIds.has(r.id)),
    );

    const regionNeighbors = this.buildRegionNeighborMap();

    for (let i = 0; i < Math.min(capitalCount, candidates.length); i++) {
      const capital = candidates[i];
      capital.development += 2;
      for (const neighborId of regionNeighbors.get(capital.id) ?? []) {
        const neighbor = this.regions[neighborId];
        if (neighbor && !neighbor.isImpassable) neighbor.development += 1;
      }
    }
  }

  private buildRegionNeighborMap(): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const hex of Object.values(this.hexes)) {
      if (!map.has(hex.regionId)) map.set(hex.regionId, new Set());
      for (const [dq, dr] of NEIGHBOR_DIRS) {
        const nk = hexKey(hex.q + dq, hex.r + dr);
        const neighbor = this.hexes[nk];
        if (neighbor && neighbor.regionId !== hex.regionId) {
          map.get(hex.regionId)!.add(neighbor.regionId);
        }
      }
    }
    return map;
  }

  private seedPopulation(): void {
    for (const region of Object.values(this.regions)) {
      if (region.isImpassable) {
        region.maxPopulation = 0;
        region.population = 0;
        continue;
      }

      const fertilityPowSum = region.hexIds.reduce((sum, hk) => {
        const f = this.hexes[hk]?.currentFertility ?? this.hexes[hk]?.baseFertility ?? 0;
        return sum + f ** 1.5;
      }, 0);

      region.maxPopulation = Math.round(fertilityPowSum * region.development * 100);
      const pct = 0.5 + this.rng() * 0.3;
      region.population = Math.round(region.maxPopulation * pct);
    }
  }

  private seedWealth(): void {
    for (const region of Object.values(this.regions)) {
      if (region.isImpassable) {
        region.wealth = 0;
        continue;
      }

      const devIncome = region.development * 5;

      const resourceValue = (region.resourceIds ?? []).reduce(
        (sum, id) => sum + (RESOURCE_BY_ID[id]?.value ?? 0),
        0,
      );

      const fertilitySum = region.hexIds.reduce((sum, hk) => {
        return sum + (this.hexes[hk]?.currentFertility ?? this.hexes[hk]?.baseFertility ?? 0);
      }, 0);

      const foodSurplus =
        region.maxPopulation > 0
          ? fertilitySum * (1 - region.population / region.maxPopulation)
          : 0;

      region.wealth = Math.round(devIncome + resourceValue + foodSurplus * 0.2);
    }
  }
}
