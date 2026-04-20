export type Terrain =
  | "plains"
  | "forest"
  | "mountains"
  | "hills"
  | "desert"
  | "coast"
  | "water"
  | "lake"
  | "city";

export type RiverSize = "small" | "large" | "veryLarge";

export interface Hex {
  q: number;
  r: number;
  regionId: string;
  terrain: Terrain;
  climate?: number; // 1 (very cold) to 10 (very hot), assigned during world gen
  riverSize?: RiverSize; // largest river bordering this hex
  baseFertility?: number; // set once at world generation, never mutated
  currentFertility?: number; // may change during gameplay; initialised to baseFertility
  baseSettlerAttraction?: number; // −100 (ineligible) to 100, set once at world generation
  currentSettlerAttraction?: number; // mutable during gameplay; initialised to baseSettlerAttraction
  resourceId?: string; // catalogue id of the resource on this hex, if any
}

export interface Region {
  id: string;
  name: string;
  regionType: "land" | "city";
  dominantTerrain: Terrain;
  ownerId: string | null;
  hexIds: string[];
  isImpassable: boolean;
  resourceIds?: string[]; // ids of resources present in this region (populated during worldgen)
  goodIds?: string[];     // ids of goods producible in this region (populated in future phases)
  development: number;    // infrastructure level; 0 for impassable, ≥1 for passable
  maxPopulation: number;  // theoretical population ceiling
  population: number;     // current population (50–80 % of max at worldgen)
  wealth: number;         // starting economic value
  // Reserved for future phases:
  rivers: never[];
  cities: never[];
}

// Canonical key for a hex corner: '|'-joined sorted triplet of the 3 adjacent hex keys
export type HexCornerKey = string;

export interface River {
  id: string;
  corners: HexCornerKey[]; // ordered path — each consecutive pair shares a hex edge
  largeFromIndex?: number;     // index into corners from which river is "large"; 0 = entire river
  veryLargeFromIndex?: number; // index into corners from which river is "very large" (second tributary junction)
}

export interface City {
  id: string;
  hexKey: string;
  name: string;
}

export type MapGenAlgorithm = "landmass-growth" | "landmass-growth-v3";
export type RegionGenAlgorithm = "weighted-bfs" | "none";

export interface WorldConfig {
  seed: number;
  width: number;
  height: number;
  mapGenAlgorithm: MapGenAlgorithm;
  regionGenAlgorithm: RegionGenAlgorithm;
  meanRegionSize: number;
  minLandFraction: number;
  mountainDensity: number; // max fraction of land hexes that should be mountains
  minLandmassForRiver: number;
  hexesPerRiver: number;
  hexesPerCity: number;
}

export interface World {
  config: WorldConfig;
  hexes: Record<string, Hex>;
  regions: Record<string, Region>;
  rivers: River[];
  cities: City[];
}
