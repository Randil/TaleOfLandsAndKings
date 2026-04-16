export type Terrain =
  | "plains"
  | "forest"
  | "mountains"
  | "hills"
  | "desert"
  | "coast"
  | "water"
  | "lake";

export interface Hex {
  q: number;
  r: number;
  regionId: string;
  terrain: Terrain;
}

export interface Region {
  id: string;
  name: string;
  dominantTerrain: Terrain;
  ownerId: string | null;
  hexIds: string[];
  // Reserved for future phases:
  rivers: never[];
  cities: never[];
  villages: never[];
}

// Canonical key for a hex corner: '|'-joined sorted triplet of the 3 adjacent hex keys
export type HexCornerKey = string;

export interface River {
  id: string;
  corners: HexCornerKey[]; // ordered path — each consecutive pair shares a hex edge
  largeFromIndex?: number;     // index into corners from which river is "large"; 0 = entire river
  veryLargeFromIndex?: number; // index into corners from which river is "very large" (second tributary junction)
}

export type MapGenAlgorithm = "landmass-growth" | "landmass-growth-v3";

export interface WorldConfig {
  seed: number;
  width: number;
  height: number;
  mapGenAlgorithm: MapGenAlgorithm;
  minLandFraction: number;
  mountainDensity: number; // max fraction of land hexes that should be mountains
  minLandmassForRiver: number;
  hexesPerRiver: number;
}

export interface World {
  config: WorldConfig;
  hexes: Record<string, Hex>;
  regions: Record<string, Region>;
  rivers: River[];
}
