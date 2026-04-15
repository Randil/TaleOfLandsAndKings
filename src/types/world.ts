export type Terrain = 'plains' | 'forest' | 'mountains' | 'hills' | 'desert' | 'coast' | 'water';

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

export interface WorldConfig {
  seed: number;
  numRegions: number;
}

export interface World {
  config: WorldConfig;
  hexes: Record<string, Hex>;
  regions: Record<string, Region>;
}
