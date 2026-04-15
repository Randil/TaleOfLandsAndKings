export const HEX_SIZE = 12;

// Axial coordinate key
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

// Axial distance between two hexes
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

// Flat-top hex: axial → pixel center
export function hexToPixel(q: number, r: number, size: number = HEX_SIZE): { x: number; y: number } {
  const x = size * (3 / 2) * q;
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
}

// Flat-top hex corners (relative to center)
export function hexCorners(size: number = HEX_SIZE): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return { x: size * Math.cos(angle), y: size * Math.sin(angle) };
  });
}

// Flat-top hex: 6 axial neighbor directions
const NEIGHBOR_DIRS = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
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

// Compute bounding box of all hex centers (for SVG viewBox)
export function hexBounds(coords: [number, number][], size: number = HEX_SIZE) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
