import type { World, WorldConfig, RiverSize } from "../types/world";
import { makeRng } from "./rng";
import { TerrainGenerator } from "./TerrainGenerator";
import { RiverGenerator } from "./RiverGenerator";
import { ClimateGenerator } from "./ClimateGenerator";
import { FertilityGenerator } from "./FertilityGenerator";
import { SettlerAttractionGenerator } from "./SettlerAttractionGenerator";
import { CityGenerator } from "./CityGenerator";
import { RegionGenerator } from "./RegionGenerator";
import { ResourceGenerator } from "./ResourceGenerator";
import { EconomyGenerator } from "./EconomyGenerator";

export function generateWorld(config: WorldConfig, onLog?: (msg: string) => void): World {
  const rng = makeRng(config.seed);

  onLog?.(`Generating world — seed ${config.seed}, ${config.width}×${config.height}`);

  const { hexes, allCoords, coordSet } = new TerrainGenerator(config, rng, onLog).generate();
  const rivers = new RiverGenerator(hexes, coordSet, allCoords, config, rng, onLog).generate();
  new ClimateGenerator(config, hexes, allCoords, coordSet, rng, onLog).generate();

  const RIVER_SIZE_RANK: Record<RiverSize, number> = { small: 1, large: 2, veryLarge: 3 };
  for (const river of rivers) {
    for (let ci = 0; ci < river.corners.length - 1; ci++) {
      const size: RiverSize =
        river.veryLargeFromIndex !== undefined && ci >= river.veryLargeFromIndex
          ? "veryLarge"
          : river.largeFromIndex !== undefined && ci >= river.largeFromIndex
            ? "large"
            : "small";
      const set1 = new Set(river.corners[ci].split("|"));
      for (const hk of river.corners[ci + 1].split("|")) {
        if (!set1.has(hk) || !hexes[hk]) continue;
        const existing = hexes[hk].riverSize;
        if (!existing || RIVER_SIZE_RANK[size] > RIVER_SIZE_RANK[existing]) {
          hexes[hk].riverSize = size;
        }
      }
    }
  }

  new FertilityGenerator(config, hexes, allCoords, coordSet, rng, onLog).generate();
  new SettlerAttractionGenerator(config, hexes, allCoords, coordSet, onLog).generate();
  const cities = new CityGenerator(config, hexes, allCoords, coordSet, onLog).generate();
  const regions = new RegionGenerator(config, hexes, allCoords, rng, cities, onLog).generate();
  new ResourceGenerator(config, hexes, regions, rng, onLog).generate();
  new EconomyGenerator(hexes, regions, cities, rng, onLog).generate();

  const hexCount = Object.keys(hexes).length;
  const regionCount = Object.keys(regions).length;
  onLog?.(`Done — ${hexCount.toLocaleString()} hexes, ${rivers.length} rivers, ${regionCount} regions`);

  return { config, hexes, regions, rivers, cities };
}
