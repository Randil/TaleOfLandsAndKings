import { useRef, useState, useCallback, useEffect } from 'react';
import type { World, Terrain } from '../types/world';
import { hexToPixel, hexCorners, HEX_SIZE, hexBounds, hexNeighbors, hexKey } from '../game/hexMath';

const TERRAIN_COLORS: Record<Terrain, string> = {
  plains:    '#c8d98a',
  forest:    '#4a7c59',
  mountains: '#7a6a5a',
  hills:     '#a89070',
  desert:    '#e3c98a',
  coast:     '#a8c8e0',
  water:     '#3a6ea8',
};

const REGION_BORDER_COLOR = '#1a1a2e';
const REGION_BORDER_WIDTH = 2;
const HEX_BORDER_COLOR = 'rgba(0,0,0,0.15)';
const HEX_BORDER_WIDTH = 0.5;

interface Props {
  world: World;
}

export function HexGrid({ world }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);

  const corners = hexCorners(HEX_SIZE);
  const allCoords = Object.values(world.hexes).map(h => [h.q, h.r] as [number, number]);
  const bounds = hexBounds(allCoords, HEX_SIZE);

  // Center the map on mount / world change
  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [world]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart.current) return;
    setTransform(t => ({
      ...t,
      x: dragStart.current!.tx + (e.clientX - dragStart.current!.mx),
      y: dragStart.current!.ty + (e.clientY - dragStart.current!.my),
    }));
  }, []);

  const onMouseUp = useCallback(() => { dragStart.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => ({
      ...t,
      scale: Math.min(8, Math.max(0.2, t.scale * factor)),
    }));
  }, []);

  function cornersToPoints(cx: number, cy: number): string {
    return corners.map(c => `${cx + c.x},${cy + c.y}`).join(' ');
  }

  // Determine which hex edges are region borders
  function isRegionBorder(q: number, r: number, neighborQ: number, neighborR: number): boolean {
    const key = hexKey(q, r);
    const nKey = hexKey(neighborQ, neighborR);
    const hex = world.hexes[key];
    const neighbor = world.hexes[nKey];
    if (!hex || !neighbor) return true; // edge of map
    return hex.regionId !== neighbor.regionId;
  }

  // For each hex, compute which of the 6 edges are region borders
  // Flat-top: edge i is between corner i and corner (i+1)%6, shared with neighbor direction i
  function borderEdges(q: number, r: number): boolean[] {
    const neighbors = hexNeighbors(q, r);
    return neighbors.map(([nq, nr]) => isRegionBorder(q, r, nq, nr));
  }

  const hexList = Object.values(world.hexes);

  return (
    <svg
      ref={svgRef}
      className="hex-grid"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      style={{ cursor: dragStart.current ? 'grabbing' : 'grab' }}
    >
      <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
        <g transform={`translate(${-bounds.minX}, ${-bounds.minY})`}>
          {/* Render hex fills */}
          {hexList.map(hex => {
            const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
            const pts = cornersToPoints(x, y);
            return (
              <polygon
                key={`${hex.q},${hex.r}`}
                points={pts}
                fill={TERRAIN_COLORS[hex.terrain]}
                stroke={HEX_BORDER_COLOR}
                strokeWidth={HEX_BORDER_WIDTH}
              />
            );
          })}

          {/* Render region border edges on top */}
          {hexList.map(hex => {
            const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
            const borders = borderEdges(hex.q, hex.r);
            return borders.map((isBorder, i) => {
              if (!isBorder) return null;
              const c1 = corners[i];
              const c2 = corners[(i + 1) % 6];
              return (
                <line
                  key={`${hex.q},${hex.r}-${i}`}
                  x1={x + c1.x} y1={y + c1.y}
                  x2={x + c2.x} y2={y + c2.y}
                  stroke={REGION_BORDER_COLOR}
                  strokeWidth={REGION_BORDER_WIDTH}
                  strokeLinecap="round"
                />
              );
            });
          })}
        </g>
      </g>
    </svg>
  );
}
