import type { World, WorldConfig, Terrain } from "../types/world";
import { makeRng } from "./rng";
import { TerrainGenerator } from "./TerrainGenerator";
import { RiverGenerator } from "./RiverGenerator";

export function generateWorld(config: WorldConfig, onLog?: (msg: string) => void): World {
  const rng = makeRng(config.seed);

  onLog?.(`Generating world — seed ${config.seed}, ${config.width}×${config.height}`);

  const { hexes, allCoords, coordSet } = new TerrainGenerator(config, rng, onLog).generate();
  const rivers = new RiverGenerator(hexes, coordSet, allCoords, config, rng, onLog).generate();

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
