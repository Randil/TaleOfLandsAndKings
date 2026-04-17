import type { World, WorldConfig, Terrain, RiverSize } from "../types/world";
import { makeRng } from "./rng";
import { TerrainGenerator } from "./TerrainGenerator";
import { RiverGenerator } from "./RiverGenerator";
import { ClimateGenerator } from "./ClimateGenerator";

export function generateWorld(config: WorldConfig, onLog?: (msg: string) => void): World {
  const rng = makeRng(config.seed);

  onLog?.(`Generating world — seed ${config.seed}, ${config.width}×${config.height}`);

  const { hexes, allCoords, coordSet } = new TerrainGenerator(config, rng, onLog).generate();
  const rivers = new RiverGenerator(hexes, coordSet, allCoords, config, rng, onLog).generate();
  new ClimateGenerator(config, hexes, allCoords, coordSet, rng, onLog).generate();

  // Annotate each hex with the largest river that borders it.
  // A river segment flows along the edge shared by the 2 hexes that appear
  // in both consecutive corner triplets (intersection of the two sets of 3).
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

  const hexCount = Object.keys(hexes).length;
  onLog?.(`Done — ${hexCount.toLocaleString()} hexes, ${rivers.length} rivers`);

  return { config, hexes, regions, rivers };
}
