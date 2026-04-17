export const HEX_SIZE = 12;

// Axial coordinate key
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

// Axial distance between two hexes
export function hexDistance(
  q1: number,
  r1: number,
  q2: number,
  r2: number,
): number {
  return (
    (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
  );
}

// Flat-top hex: axial → pixel center
export function hexToPixel(
  q: number,
  r: number,
  size: number = HEX_SIZE,
): { x: number; y: number } {
  const x = size * (3 / 2) * q;
  const y = size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return { x, y };
}

// Flat-top hex corners (relative to center)
export function hexCorners(
  size: number = HEX_SIZE,
): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return { x: size * Math.cos(angle), y: size * Math.sin(angle) };
  });
}

// Flat-top hex: 6 axial neighbor directions
export const NEIGHBOR_DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function hexNeighbors(q: number, r: number): [number, number][] {
  return NEIGHBOR_DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

// Generate all hexes within a given radius (axial coords)
export function hexesInRadius(radius: number): [number, number][] {
  const results: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      results.push([q, r]);
    }
  }
  return results;
}

// Generate all hexes in a rectangular grid using axial coordinates.
// Column = q, row = r, with odd-q offset so rows stagger naturally.
export function hexesInRect(width: number, height: number): [number, number][] {
  const results: [number, number][] = [];
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      // Convert offset (col=q, row=r) to axial: shift r by floor(q/2)
      results.push([q, r - Math.floor(q / 2)]);
    }
  }
  return results;
}

// Maps axial direction string to edge index (edge i = corners i and i+1, shared with neighbor dir i)
const NEIGHBOR_DIR_TO_EDGE: Record<string, number> = {
  "1,0": 0,
  "0,1": 1,
  "-1,1": 2,
  "-1,0": 3,
  "0,-1": 4,
  "1,-1": 5,
};

// Returns absolute pixel coords of the shared edge between two adjacent hexes.
// The edge is defined by two corner points of hex (q1,r1).
export function sharedEdgePixels(
  q1: number,
  r1: number,
  q2: number,
  r2: number,
  size: number = HEX_SIZE,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const edgeIdx = NEIGHBOR_DIR_TO_EDGE[`${q2 - q1},${r2 - r1}`];
  if (edgeIdx === undefined) return null;
  const { x: cx, y: cy } = hexToPixel(q1, r1, size);
  const corners = hexCorners(size);
  const c1 = corners[edgeIdx];
  const c2 = corners[(edgeIdx + 1) % 6];
  return { x1: cx + c1.x, y1: cy + c1.y, x2: cx + c2.x, y2: cy + c2.y };
}

// Returns the 6 corner triplets for hex (q, r).
// Corner i sits between edges i and (i-1+6)%6, shared by (q,r) and its neighbors
// in directions i and (i-1+6)%6. Each triplet is returned sorted (canonical).
export function hexCornerTriplets(
  q: number,
  r: number,
): [string, string, string][] {
  return Array.from({ length: 6 }, (_, i) => {
    const [d1q, d1r] = NEIGHBOR_DIRS[i];
    const [d2q, d2r] = NEIGHBOR_DIRS[(i - 1 + 6) % 6];
    const triplet: [string, string, string] = [
      hexKey(q, r),
      hexKey(q + d1q, r + d1r),
      hexKey(q + d2q, r + d2r),
    ];
    triplet.sort();
    return triplet;
  });
}

// Given a corner's sorted hex-key triplet, returns the 3 adjacent corner triplets.
// Each adjacent corner shares 2 of the 3 hexes (they are connected by the shared edge).
export function adjacentCornerTriplets(
  h1k: string,
  h2k: string,
  h3k: string,
): [string, string, string][] {
  const parseHexKey = (k: string): [number, number] => {
    const i = k.indexOf(",");
    return [parseInt(k.slice(0, i), 10), parseInt(k.slice(i + 1), 10)];
  };

  const hs: [string, number, number][] = [
    [h1k, ...parseHexKey(h1k)],
    [h2k, ...parseHexKey(h2k)],
    [h3k, ...parseHexKey(h3k)],
  ];

  const result: [string, string, string][] = [];
  // For each pair (A, B), C is the third hex. D is the hex that shares edge A-B
  // but is not C — forming the adjacent corner {A, B, D}.
  const pairs: [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 2, 0],
  ];
  for (const [ai, bi, ci] of pairs) {
    const [Ak, Aq, Ar] = hs[ai];
    const [Bk, Bq, Br] = hs[bi];
    const [Ck] = hs[ci];

    const dq = Bq - Aq,
      dr = Br - Ar;
    const dirIdx = NEIGHBOR_DIRS.findIndex(
      ([ddq, ddr]) => ddq === dq && ddr === dr,
    );
    if (dirIdx === -1) continue;

    const [dp0q, dp0r] = NEIGHBOR_DIRS[(dirIdx - 1 + 6) % 6];
    const [dp1q, dp1r] = NEIGHBOR_DIRS[(dirIdx + 1) % 6];
    const cand0 = hexKey(Aq + dp0q, Ar + dp0r);
    const cand1 = hexKey(Aq + dp1q, Ar + dp1r);
    const Dk = cand0 === Ck ? cand1 : cand0;

    const triplet: [string, string, string] = [Ak, Bk, Dk];
    triplet.sort();
    result.push(triplet);
  }

  return result;
}

// Pixel position of a hex corner = centroid of its 3 adjacent hex centers.
// Correct even when hex keys are off-grid (pixel coords are purely mathematical).
export function hexCornerToPixel(
  h1k: string,
  h2k: string,
  h3k: string,
  size: number = HEX_SIZE,
): { x: number; y: number } {
  const parseHexKey = (k: string): [number, number] => {
    const i = k.indexOf(",");
    return [parseInt(k.slice(0, i), 10), parseInt(k.slice(i + 1), 10)];
  };
  const pts = [h1k, h2k, h3k].map((k) => {
    const [q, r] = parseHexKey(k);
    return hexToPixel(q, r, size);
  });
  return {
    x: (pts[0].x + pts[1].x + pts[2].x) / 3,
    y: (pts[0].y + pts[1].y + pts[2].y) / 3,
  };
}

// Flat-top hex: pixel → nearest axial coords (inverse of hexToPixel)
export function pixelToHex(
  x: number,
  y: number,
  size: number = HEX_SIZE,
): { q: number; r: number } {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
  // Cube rounding
  let cx = q,
    cz = r,
    cy = -cx - cz;
  let rx = Math.round(cx),
    ry = Math.round(cy),
    rz = Math.round(cz);
  const dx = Math.abs(rx - cx),
    dy = Math.abs(ry - cy),
    dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

// Compute bounding box of all hex centers (for SVG viewBox)
export function hexBounds(coords: [number, number][], size: number = HEX_SIZE) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [q, r] of coords) {
    const { x, y } = hexToPixel(q, r, size);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const pad = size * 2;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}
