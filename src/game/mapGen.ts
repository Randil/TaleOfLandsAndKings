import type { World, WorldConfig, Hex, Region, Terrain } from '../types/world';
import { makeRng, rngShuffle, rngPick } from './rng';
import { hexKey, hexDistance, hexesInRadius } from './hexMath';
import { REGION_NAMES } from './regionNames';

const LAND_TERRAINS: Terrain[] = ['plains', 'forest', 'mountains', 'hills', 'desert'];

const TERRAIN_NEIGHBORS: Record<Terrain, Terrain[]> = {
  plains:    ['plains', 'plains', 'hills', 'forest', 'desert'],
  forest:    ['forest', 'forest', 'plains', 'hills'],
  mountains: ['mountains', 'mountains', 'hills', 'hills'],
  hills:     ['hills', 'plains', 'forest', 'mountains'],
  desert:    ['desert', 'desert', 'plains', 'hills'],
  coast:     ['coast', 'plains', 'hills'],
  water:     ['water'],
};

// Radius such that total hexes ≈ numRegions * 200
function gridRadius(numRegions: number): number {
  return Math.ceil(Math.sqrt((numRegions * 200) / Math.PI));
}

// Pick N well-spread seed positions from the hex list using a greedy farthest-point approach
function pickSeeds(allCoords: [number, number][], n: number, rng: () => number): [number, number][] {
  const shuffled = rngShuffle(rng, allCoords);
  const seeds: [number, number][] = [shuffled[0]];

  while (seeds.length < n) {
    let bestDist = -1;
    let best = shuffled[0];
    for (const coord of shuffled) {
      const minDist = Math.min(...seeds.map(([sq, sr]) => hexDistance(coord[0], coord[1], sq, sr)));
      if (minDist > bestDist) {
        bestDist = minDist;
        best = coord;
      }
    }
    seeds.push(best);
  }

  return seeds;
}

export function generateWorld(config: WorldConfig): World {
  const { seed, numRegions } = config;
  const rng = makeRng(seed);
  const radius = gridRadius(numRegions);

  const allCoords = hexesInRadius(radius);

  // Outer ring becomes water
  const waterSet = new Set<string>();
  for (const [q, r] of allCoords) {
    if (Math.abs(q) === radius || Math.abs(r) === radius || Math.abs(q + r) === radius) {
      waterSet.add(hexKey(q, r));
    }
  }

  const landCoords = allCoords.filter(([q, r]) => !waterSet.has(hexKey(q, r)));

  // Pick region seed hexes from land only
  const seeds = pickSeeds(landCoords, numRegions, rng);

  // Voronoi partition: assign each land hex to nearest seed
  const seedRegionIds = seeds.map((_, i) => `region_${i}`);
  const hexRegionMap = new Map<string, string>();

  for (const [q, r] of landCoords) {
    let bestDist = Infinity;
    let bestId = seedRegionIds[0];
    for (let i = 0; i < seeds.length; i++) {
      const d = hexDistance(q, r, seeds[i][0], seeds[i][1]);
      if (d < bestDist) {
        bestDist = d;
        bestId = seedRegionIds[i];
      }
    }
    hexRegionMap.set(hexKey(q, r), bestId);
  }

  // Assign dominant terrain per region
  const shuffledNames = rngShuffle(rng, [...REGION_NAMES]);
  const regionDominantTerrain = new Map<string, Terrain>();
  for (let i = 0; i < numRegions; i++) {
    regionDominantTerrain.set(seedRegionIds[i], rngPick(rng, LAND_TERRAINS));
  }

  // Build hexes
  const hexes: Record<string, Hex> = {};

  // Water hexes
  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (waterSet.has(key)) {
      hexes[key] = { q, r, regionId: 'water', terrain: 'water' };
    }
  }

  // Land hexes — terrain varies around dominant with noise
  for (const [q, r] of landCoords) {
    const key = hexKey(q, r);
    const regionId = hexRegionMap.get(key)!;
    const dominant = regionDominantTerrain.get(regionId)!;
    // 60% dominant, 40% neighboring terrain
    const terrain: Terrain = rng() < 0.6 ? dominant : rngPick(rng, TERRAIN_NEIGHBORS[dominant]);
    hexes[key] = { q, r, regionId, terrain };
  }

  // Build regions
  const regions: Record<string, Region> = {};

  // Water pseudo-region
  regions['water'] = {
    id: 'water',
    name: 'Ocean',
    dominantTerrain: 'water',
    ownerId: null,
    hexIds: Object.keys(hexes).filter(k => hexes[k].regionId === 'water'),
    rivers: [],
    cities: [],
    villages: [],
  };

  for (let i = 0; i < numRegions; i++) {
    const id = seedRegionIds[i];
    regions[id] = {
      id,
      name: shuffledNames[i % shuffledNames.length],
      dominantTerrain: regionDominantTerrain.get(id)!,
      ownerId: null,
      hexIds: Object.keys(hexes).filter(k => hexes[k].regionId === id),
      rivers: [],
      cities: [],
      villages: [],
    };
  }

  return { config, hexes, regions };
}
