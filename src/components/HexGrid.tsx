import { useRef, useCallback, useEffect, useMemo } from "react";
import type { World, Terrain } from "../types/world";
import {
  hexToPixel,
  hexCorners,
  HEX_SIZE,
  hexBounds,
  hexCornerToPixel,
  hexKey,
  pixelToHex,
} from "../game/hexMath";

const TERRAIN_COLORS: Record<Terrain, string> = {
  plains: "#c8d98a",
  forest: "#4a7c59",
  mountains: "#7a6a5a",
  hills: "#a89070",
  desert: "#e3c98a",
  coast: "#a8c8e0",
  water: "#3a6ea8",
  lake: "#7ab8d4",
};

const RIVER_HIGHLIGHT_COLORS = [
  "#ff6b35",
  "#e63946",
  "#ff9f1c",
  "#f4a261",
  "#e76f51",
  "#d62828",
];

function drawRiverSegments(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  lfi: number | undefined,
  vlfi: number | undefined,
  smallWidth: number,
  largeWidth: number,
  veryLargeWidth: number,
): void {
  // Helper to draw a polyline from index `from` to `to` (inclusive)
  const stroke = (from: number, to: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[from].x, pts[from].y);
    for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  };

  const end = pts.length - 1;

  if (lfi === undefined) {
    // Entirely small
    stroke(0, end, smallWidth);
  } else if (lfi === 0 && vlfi === undefined) {
    // Entirely large
    stroke(0, end, largeWidth);
  } else if (lfi === 0 && vlfi !== undefined) {
    // Large from start, then very large from vlfi
    stroke(0, vlfi, largeWidth);
    stroke(vlfi, end, veryLargeWidth);
  } else if (vlfi === undefined) {
    // Small headwater → large
    stroke(0, lfi, smallWidth);
    stroke(lfi, end, largeWidth);
  } else {
    // Small headwater → large → very large
    stroke(0, lfi, smallWidth);
    stroke(lfi, vlfi, largeWidth);
    stroke(vlfi, end, veryLargeWidth);
  }
}

interface Props {
  world: World;
  onHoverHex?: (key: string | null) => void;
}

export function HexGrid({ world, onHoverHex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const hoveredHexKeyRef = useRef<string | null>(null);
  const dragStart = useRef<{
    mx: number;
    my: number;
    tx: number;
    ty: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  const corners = useMemo(() => hexCorners(HEX_SIZE), []);

  const allCoords = useMemo(
    () => Object.values(world.hexes).map((h) => [h.q, h.r] as [number, number]),
    [world.hexes],
  );
  const bounds = useMemo(() => hexBounds(allCoords, HEX_SIZE), [allCoords]);

  // Build lookup: hexKey → river indices
  const riversByHexKey = useMemo(() => {
    const map = new Map<string, number[]>();
    world.rivers.forEach((river, ri) => {
      for (const cornerKey of river.corners) {
        for (const hk of cornerKey.split("|")) {
          if (!map.has(hk)) map.set(hk, []);
          const arr = map.get(hk)!;
          if (arr[arr.length - 1] !== ri) arr.push(ri);
        }
      }
    });
    return map;
  }, [world.rivers]);

  // Pre-compute river point arrays
  const riverPoints = useMemo(
    () =>
      world.rivers.map((river) => {
        if (river.corners.length < 2) return null;
        return river.corners.map((ck) => {
          const [h1, h2, h3] = ck.split("|");
          return hexCornerToPixel(h1, h2, h3);
        });
      }),
    [world.rivers],
  );

  // Main draw — reads transform and hoveredHexKey from refs, no React state deps
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y, scale } = transformRef.current;
    const hoveredHexKey = hoveredHexKeyRef.current;
    const highlightedRiverIndices = new Set<number>(
      riversByHexKey.get(hoveredHexKey ?? "") ?? [],
    );

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-bounds.minX, -bounds.minY);

    // Draw hex fills + borders
    for (const hex of Object.values(world.hexes)) {
      const { x: hx, y: hy } = hexToPixel(hex.q, hex.r, HEX_SIZE);
      ctx.beginPath();
      ctx.moveTo(hx + corners[0].x, hy + corners[0].y);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(hx + corners[i].x, hy + corners[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = TERRAIN_COLORS[hex.terrain];
      ctx.fill();
      ctx.strokeStyle = "#00000033";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw rivers (normal)
    ctx.strokeStyle = "#7ec8e3";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let ri = 0; ri < world.rivers.length; ri++) {
      if (highlightedRiverIndices.has(ri)) continue;
      const pts = riverPoints[ri];
      if (!pts) continue;
      const lfi = world.rivers[ri].largeFromIndex;
      const vlfi = world.rivers[ri].veryLargeFromIndex;
      drawRiverSegments(ctx, pts, lfi, vlfi, 1.5, 3, 4.5);
    }

    // Draw highlighted rivers on top
    let colorIdx = 0;
    for (const ri of highlightedRiverIndices) {
      const pts = riverPoints[ri];
      if (!pts) continue;
      ctx.strokeStyle =
        RIVER_HIGHLIGHT_COLORS[colorIdx % RIVER_HIGHLIGHT_COLORS.length];
      const lfi = world.rivers[ri].largeFromIndex;
      const vlfi = world.rivers[ri].veryLargeFromIndex;
      drawRiverSegments(ctx, pts, lfi, vlfi, 2, 4, 6);
      colorIdx++;
    }

    ctx.restore();
  }, [world, bounds, corners, riverPoints, riversByHexKey]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Resize observer — keep canvas pixel size in sync with its CSS size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        draw();
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // Redraw whenever draw changes (world/bounds/etc. changed)
  useEffect(() => {
    draw();
  }, [draw]);

  // Reset view on world change
  useEffect(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
  }, [world]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = transformRef.current;
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: x, ty: y };
    hoveredHexKeyRef.current = null;
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const start = dragStart.current;
      if (start) {
        transformRef.current = {
          ...transformRef.current,
          x: start.tx + (e.clientX - start.mx),
          y: start.ty + (e.clientY - start.my),
        };
        scheduleDraw();
        return;
      }

      // Hit-test: invert canvas transform to get world-space coords
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x, y, scale } = transformRef.current;
      const cx = (e.clientX - rect.left - x) / scale + bounds.minX;
      const cy = (e.clientY - rect.top - y) / scale + bounds.minY;
      const { q, r } = pixelToHex(cx, cy, HEX_SIZE);
      const hk = hexKey(q, r);
      const next = world.hexes[hk] ? hk : null;
      if (next !== hoveredHexKeyRef.current) {
        hoveredHexKeyRef.current = next;
        onHoverHex?.(next);
        scheduleDraw();
      }
    },
    [bounds, world.hexes, scheduleDraw],
  );

  const onMouseUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  const onMouseLeave = useCallback(() => {
    dragStart.current = null;
    hoveredHexKeyRef.current = null;
    onHoverHex?.(null);
    scheduleDraw();
  }, [scheduleDraw, onHoverHex]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      transformRef.current = {
        ...transformRef.current,
        scale: Math.min(8, Math.max(0.2, transformRef.current.scale * factor)),
      };
      scheduleDraw();
    },
    [scheduleDraw],
  );

  return (
    <canvas
      ref={canvasRef}
      className="hex-grid"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
      style={{ cursor: dragStart.current ? "grabbing" : "grab" }}
    />
  );
}
