import type { World, WorldConfig, Hex, Terrain, River, RiverEdge } from '../types/world';
import { makeRng, rngInt, rngPick } from './rng';
import { hexKey, hexNeighbors, hexesInRect, NEIGHBOR_DIRS } from './hexMath';

// Elevation ladder: each time a hex is "selected" it moves one step up
const ELEVATION: Record<Terrain, Terrain> = {
  water:     'plains',
  plains:    'hills',
  hills:     'mountains',
  mountains: 'mountains',
  lake:      'lake',
  forest:    'forest',
  desert:    'desert',
  coast:     'coast',
};

export function generateWorld(config: WorldConfig): World {
  const rng = makeRng(config.seed);
  switch (config.mapGenAlgorithm) {
    case 'landmass-growth':
      return landmassGrowthGen(config, rng, false);
    case 'landmass-growth-v2':
      return landmassGrowthGen(config, rng, true);
  }
}

function landmassGrowthGen(
  config: WorldConfig,
  rng: () => number,
  peninsulaAvoidance: boolean,
): World {
  const { width, height, minLandFraction } = config;

  const allCoords = hexesInRect(width, height);
  const totalHexes = allCoords.length;
  const coordSet = new Set(allCoords.map(([q, r]) => hexKey(q, r)));

  // Fill map with water
  const terrainMap = new Map<string, Terrain>();
  for (const [q, r] of allCoords) {
    terrainMap.set(hexKey(q, r), 'water');
  }

  const maxLandmassSize = Math.max(1, Math.floor(totalHexes * 0.05));
  let landCount = 0;

  const isLand = (key: string): boolean => {
    const t = terrainMap.get(key);
    return t !== undefined && t !== 'water';
  };

  const landNeighborCount = (q: number, r: number): number =>
    hexNeighbors(q, r).filter(([nq, nr]) => isLand(hexKey(nq, nr))).length;

  while (landCount / totalHexes < minLandFraction) {
    const [startQ, startR] = allCoords[Math.floor(rng() * totalHexes)];
    const size = rngInt(rng, 1, maxLandmassSize);

    const frontier: [number, number][] = [[startQ, startR]];
    const visited = new Set<string>([hexKey(startQ, startR)]);
    let added = 0;

    while (frontier.length > 0 && added < size) {
      let idx = Math.floor(rng() * frontier.length);

      if (peninsulaAvoidance) {
        const [cq, cr] = frontier[idx];
        if (landNeighborCount(cq, cr) === 1) {
          // Re-roll once; accept the result regardless
          idx = Math.floor(rng() * frontier.length);
        }
      }

      const [q, r] = frontier[idx];
      frontier.splice(idx, 1);

      const key = hexKey(q, r);
      const current = terrainMap.get(key)!;
      if (current === 'water') landCount++;
      terrainMap.set(key, ELEVATION[current]);
      added++;

      for (const [nq, nr] of hexNeighbors(q, r)) {
        const nKey = hexKey(nq, nr);
        if (coordSet.has(nKey) && !visited.has(nKey)) {
          visited.add(nKey);
          frontier.push([nq, nr]);
        }
      }
    }
  }

  detectLakes(terrainMap, allCoords, coordSet);

  // Build hex records
  const hexes: Record<string, Hex> = {};
  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    const terrain = terrainMap.get(key)!;
    const isWaterLike = terrain === 'water' || terrain === 'lake';
    hexes[key] = { q, r, regionId: isWaterLike ? 'water' : 'land', terrain };
  }

  const rivers = generateRivers(hexes, coordSet, allCoords, config, rng);

  const regions = {
    water: {
      id: 'water', name: 'Ocean', dominantTerrain: 'water' as Terrain, ownerId: null,
      hexIds: Object.keys(hexes).filter(k => hexes[k].regionId === 'water'),
      rivers: [] as never[], cities: [] as never[], villages: [] as never[],
    },
    land: {
      id: 'land', name: 'Land', dominantTerrain: 'plains' as Terrain, ownerId: null,
      hexIds: Object.keys(hexes).filter(k => hexes[k].regionId === 'land'),
      rivers: [] as never[], cities: [] as never[], villages: [] as never[],
    },
  };

  return { config, hexes, regions, rivers };
}

// ─── Lake Detection ──────────────────────────────────────────────────────────

function detectLakes(
  terrainMap: Map<string, Terrain>,
  allCoords: [number, number][],
  coordSet: Set<string>,
): void {
  // BFS from every water hex on the map boundary to find ocean-connected water
  const oceanQueue: [number, number][] = [];
  const oceanKeys = new Set<string>();

  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (terrainMap.get(key) !== 'water') continue;
    const onBoundary = hexNeighbors(q, r).some(([nq, nr]) => !coordSet.has(hexKey(nq, nr)));
    if (onBoundary) {
      oceanKeys.add(key);
      oceanQueue.push([q, r]);
    }
  }

  let qi = 0;
  while (qi < oceanQueue.length) {
    const [q, r] = oceanQueue[qi++];
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nKey = hexKey(nq, nr);
      if (coordSet.has(nKey) && !oceanKeys.has(nKey) && terrainMap.get(nKey) === 'water') {
        oceanKeys.add(nKey);
        oceanQueue.push([nq, nr]);
      }
    }
  }

  // Any water hex not reachable from the boundary = inland → lake
  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (terrainMap.get(key) === 'water' && !oceanKeys.has(key)) {
      terrainMap.set(key, 'lake');
    }
  }
}

// ─── River Generation ─────────────────────────────────────────────────────────

// Returns the direction index i such that B = A + NEIGHBOR_DIRS[i]
function edgeIndex(aq: number, ar: number, bq: number, br: number): number {
  const dq = bq - aq, dr = br - ar;
  return NEIGHBOR_DIRS.findIndex(([ddq, ddr]) => ddq === dq && ddr === dr);
}

function normalizedEdgeKey(q1: number, r1: number, q2: number, r2: number): string {
  const k1 = hexKey(q1, r1), k2 = hexKey(q2, r2);
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

// Canonical key for the hex corner shared by three hexes
function vertexKey(
  q1: number, r1: number,
  q2: number, r2: number,
  q3: number, r3: number,
): string {
  return [hexKey(q1, r1), hexKey(q2, r2), hexKey(q3, r3)].sort().join('|');
}

// Given edge (hA, hB) entered from cPrev, returns the exit vertex key
function exitVertexKey(
  hAq: number, hAr: number,
  hBq: number, hBr: number,
  cPrevQ: number, cPrevR: number,
): string {
  const i = edgeIndex(hAq, hAr, hBq, hBr);
  const [dpq, dpr] = NEIGHBOR_DIRS[(i - 1 + 6) % 6];
  const [dnq, dnr] = NEIGHBOR_DIRS[(i + 1) % 6];
  const thirdI   = [hAq + dpq, hAr + dpr] as [number, number];
  const thirdIP1 = [hAq + dnq, hAr + dnr] as [number, number];
  const [cNextQ, cNextR] = (thirdI[0] === cPrevQ && thirdI[1] === cPrevR) ? thirdIP1 : thirdI;
  return vertexKey(hAq, hAr, hBq, hBr, cNextQ, cNextR);
}

function generateRivers(
  hexes: Record<string, Hex>,
  coordSet: Set<string>,
  allCoords: [number, number][],
  config: WorldConfig,
  rng: () => number,
): River[] {
  const { minLandmassForRiver, hexesPerRiver } = config;
  const rivers: River[] = [];
  const allRiverEdges = new Set<string>();

  // Find connected landmasses via BFS over non-water hexes
  const globalVisited = new Set<string>();
  const landmasses: [number, number][][] = [];

  for (const [q, r] of allCoords) {
    const key = hexKey(q, r);
    if (globalVisited.has(key)) continue;
    const terrain = hexes[key].terrain;
    if (terrain === 'water' || terrain === 'lake') continue;

    const mass: [number, number][] = [];
    const queue: [number, number][] = [[q, r]];
    globalVisited.add(key);

    let qi = 0;
    while (qi < queue.length) {
      const [cq, cr] = queue[qi++];
      mass.push([cq, cr]);
      for (const [nq, nr] of hexNeighbors(cq, cr)) {
        const nKey = hexKey(nq, nr);
        if (globalVisited.has(nKey) || !coordSet.has(nKey)) continue;
        const nt = hexes[nKey].terrain;
        if (nt !== 'water' && nt !== 'lake') {
          globalVisited.add(nKey);
          queue.push([nq, nr]);
        }
      }
    }

    landmasses.push(mass);
  }

  for (const mass of landmasses) {
    if (mass.length < minLandmassForRiver) continue;

    const riverCount = Math.max(1, Math.floor(mass.length / hexesPerRiver));

    for (let ri = 0; ri < riverCount; ri++) {
      const sources = mass.filter(([q, r]) => {
        const t = hexes[hexKey(q, r)].terrain;
        return t === 'mountains' || t === 'hills' || t === 'lake';
      });
      if (sources.length === 0) continue;

      const [sq, sr] = rngPick(rng, sources);
      const riverEdges = traceRiver(sq, sr, hexes, coordSet, allRiverEdges, rng);

      if (riverEdges.length > 0) {
        for (const e of riverEdges) {
          allRiverEdges.add(normalizedEdgeKey(e.q1, e.r1, e.q2, e.r2));
        }
        rivers.push({ id: `river_${rivers.length}`, edges: riverEdges });
      }
    }
  }

  return rivers;
}

// Traces a river path as a sequence of hex edges where each consecutive
// pair of edges shares exactly one vertex (hex corner).
//
// State: current edge (hA, hB) + cPrev (the third hex at the entry vertex).
// At each step the exit vertex is the other end of the edge; its third hex
// cNext is whichever of the two corner-hexes is NOT cPrev.
// The two candidate next edges are hA-cNext and hB-cNext.
// After choosing one (say hA-cNext), cPrev_next = hB (the dropped hex).
function traceRiver(
  sq: number, sr: number,
  hexes: Record<string, Hex>,
  coordSet: Set<string>,
  allRiverEdges: Set<string>,
  rng: () => number,
): RiverEdge[] {
  // Initial edge: source hex + a random non-water land neighbor
  const neighbors = hexNeighbors(sq, sr).filter(([nq, nr]) => {
    const k = hexKey(nq, nr);
    const t = hexes[k]?.terrain;
    return coordSet.has(k) && t !== 'water' && t !== 'lake';
  });
  if (neighbors.length === 0) return [];

  const [initNQ, initNR] = rngPick(rng, neighbors);

  let hAq = sq, hAr = sr;
  let hBq = initNQ, hBr = initNR;

  // Pick an initial cPrev to set flow direction (random choice between the two options)
  const iInit = edgeIndex(hAq, hAr, hBq, hBr);
  const [d0q, d0r] = NEIGHBOR_DIRS[(iInit - 1 + 6) % 6];
  const [d1q, d1r] = NEIGHBOR_DIRS[(iInit + 1) % 6];
  let cPrevQ: number, cPrevR: number;
  if (rng() < 0.5) { cPrevQ = hAq + d0q; cPrevR = hAr + d0r; }
  else              { cPrevQ = hAq + d1q; cPrevR = hAr + d1r; }

  const edges: RiverEdge[] = [];
  const usedEdges = new Set<string>();
  const visitedVertices = new Set<string>();

  // Mark the entry vertex of the first edge so the river never returns to its source
  visitedVertices.add(vertexKey(hAq, hAr, hBq, hBr, cPrevQ, cPrevR));

  while (edges.length < 300) {
    const eKey = normalizedEdgeKey(hAq, hAr, hBq, hBr);
    if (usedEdges.has(eKey) || allRiverEdges.has(eKey)) break;
    usedEdges.add(eKey);
    edges.push({ q1: hAq, r1: hAr, q2: hBq, r2: hBr });

    // Find cNext: the third hex at the exit vertex
    const i = edgeIndex(hAq, hAr, hBq, hBr);
    const [dpq, dpr] = NEIGHBOR_DIRS[(i - 1 + 6) % 6];
    const [dnq, dnr] = NEIGHBOR_DIRS[(i + 1) % 6];
    const thirdI   = [hAq + dpq, hAr + dpr] as [number, number];
    const thirdIP1 = [hAq + dnq, hAr + dnr] as [number, number];

    const [cNextQ, cNextR] = (thirdI[0] === cPrevQ && thirdI[1] === cPrevR)
      ? thirdIP1 : thirdI;

    // Terminate when cNext is off-map or water
    if (!coordSet.has(hexKey(cNextQ, cNextR))) break;
    const cNextTerrain = hexes[hexKey(cNextQ, cNextR)]?.terrain;
    if (cNextTerrain === 'water' || cNextTerrain === 'lake') break;

    // Check the exit vertex — if already visited the river would cycle
    const vExitKey = vertexKey(hAq, hAr, hBq, hBr, cNextQ, cNextR);
    if (visitedVertices.has(vExitKey)) break;
    visitedVertices.add(vExitKey);

    // Two candidate next edges: hA-cNext or hB-cNext
    // Filter: edge not already used AND the candidate's own exit vertex not yet visited
    // (the "go the other way" rule — prefer the direction that doesn't revisit a corner)
    const candidates: Array<[number, number, number, number]> = (
      [[hAq, hAr, cNextQ, cNextR], [hBq, hBr, cNextQ, cNextR]] as Array<[number, number, number, number]>
    ).filter(([nAq, nAr, nBq, nBr]) => {
      const k = normalizedEdgeKey(nAq, nAr, nBq, nBr);
      if (usedEdges.has(k) || allRiverEdges.has(k)) return false;
      // cPrev for the candidate = whichever of hA/hB is not nA
      const [cpq, cpr] = (nAq === hAq && nAr === hAr) ? [hBq, hBr] : [hAq, hAr];
      return !visitedVertices.has(exitVertexKey(nAq, nAr, nBq, nBr, cpq, cpr));
    });

    if (candidates.length === 0) break;

    const [nAq, nAr, nBq, nBr] = rngPick(rng, candidates);

    // cPrev for next step = the hex from {hA, hB} that is NOT nA
    const keepA = nAq === hAq && nAr === hAr;
    cPrevQ = keepA ? hBq : hAq;
    cPrevR = keepA ? hBr : hAr;

    hAq = nAq; hAr = nAr;
    hBq = nBq; hBr = nBr;
  }

  return edges;
}
