import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { World, Terrain } from '../types/world';
import { hexToPixel, hexCorners, HEX_SIZE, hexBounds, hexCornerToPixel, hexKey } from '../game/hexMath';

const TERRAIN_COLORS: Record<Terrain, string> = {
  plains:    '#c8d98a',
  forest:    '#4a7c59',
  mountains: '#7a6a5a',
  hills:     '#a89070',
  desert:    '#e3c98a',
  coast:     '#a8c8e0',
  water:     '#3a6ea8',
  lake:      '#7ab8d4',
};

const RIVER_HIGHLIGHT_COLORS = [
  '#ff6b35', '#e63946', '#ff9f1c', '#f4a261', '#e76f51', '#d62828',
];

interface Props {
  world: World;
}

export function HexGrid({ world }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const [hoveredHexKey, setHoveredHexKey] = useState<string | null>(null);

  const corners = hexCorners(HEX_SIZE);
  const allCoords = Object.values(world.hexes).map(h => [h.q, h.r] as [number, number]);
  const bounds = hexBounds(allCoords, HEX_SIZE);

  // Center the map on mount / world change
  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [world]);

  // Build lookup: hexKey → indices of rivers whose corners touch that hex
  const riversByHexKey = useMemo(() => {
    const map = new Map<string, number[]>();
    world.rivers.forEach((river, ri) => {
      for (const cornerKey of river.corners) {
        for (const hk of cornerKey.split('|')) {
          if (!map.has(hk)) map.set(hk, []);
          const arr = map.get(hk)!;
          if (arr[arr.length - 1] !== ri) arr.push(ri);
        }
      }
    });
    return map;
  }, [world.rivers]);

  const highlightedRiverIndices = useMemo((): Set<number> => {
    if (!hoveredHexKey) return new Set();
    return new Set(riversByHexKey.get(hoveredHexKey) ?? []);
  }, [hoveredHexKey, riversByHexKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
    setHoveredHexKey(null);
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const start = dragStart.current;
    if (!start) return;
    setTransform(t => ({
      ...t,
      x: start.tx + (e.clientX - start.mx),
      y: start.ty + (e.clientY - start.my),
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
            const k = hexKey(hex.q, hex.r);
            return (
              <polygon
                key={k}
                points={pts}
                fill={TERRAIN_COLORS[hex.terrain]}
                stroke="#00000033"
                strokeWidth={0.5}
                onMouseEnter={() => { if (!dragStart.current) setHoveredHexKey(k); }}
                onMouseLeave={() => setHoveredHexKey(null)}
              />
            );
          })}

          {/* Render rivers (normal) */}
          {world.rivers.map(river => {
            if (river.corners.length < 2) return null;
            const pts = river.corners.map(ck => {
              const [h1, h2, h3] = ck.split('|');
              const { x, y } = hexCornerToPixel(h1, h2, h3);
              return `${x},${y}`;
            }).join(' ');
            return (
              <polyline
                key={river.id}
                points={pts}
                fill="none"
                stroke="#7ec8e3"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Render highlighted rivers on top */}
          {highlightedRiverIndices.size > 0 && [...highlightedRiverIndices].map((ri, colorIdx) => {
            const river = world.rivers[ri];
            if (river.corners.length < 2) return null;
            const color = RIVER_HIGHLIGHT_COLORS[colorIdx % RIVER_HIGHLIGHT_COLORS.length];
            const pts = river.corners.map(ck => {
              const [h1, h2, h3] = ck.split('|');
              const { x, y } = hexCornerToPixel(h1, h2, h3);
              return `${x},${y}`;
            }).join(' ');
            return (
              <polyline
                key={`highlight-${river.id}`}
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
}
