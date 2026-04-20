import { useRef, useCallback, useEffect, useMemo } from "react";
import type { World, Terrain } from "../types/world";
import type { MapMode } from "../store/uiStore";
import type { ResourceCategory } from "../types/resources";
import { RESOURCE_BY_ID } from "../game/resources";
import {
  hexToPixel,
  hexCorners,
  HEX_SIZE,
  hexBounds,
  hexCornerToPixel,
  hexKey,
  pixelToHex,
  NEIGHBOR_DIRS,
  sharedEdgePixels,
} from "../game/hexMath";

// Only 3 of the 6 directions — visits each hex edge exactly once
const BORDER_DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1]];

const LAND_TERRAIN_SET = new Set<Terrain>(["plains", "forest", "mountains", "hills", "desert", "city"]);

// Stable hue per region index using golden-angle rotation
function regionFillColor(regionIndex: number): string {
  const hue = (regionIndex * 137.508) % 360;
  return `hsl(${hue}, 55%, 65%)`;
}

const TERRAIN_COLORS: Record<Terrain, string> = {
  plains: "#c8d98a",
  forest: "#4a7c59",
  mountains: "#7a6a5a",
  hills: "#a89070",
  desert: "#e3c98a",
  coast: "#a8c8e0",
  water: "#3a6ea8",
  lake: "#7ab8d4",
  city: "#d4a853",
};

// blue(1) → green(5-6) → red(10)
function climateColor(value: number): string {
  const t = (Math.min(10, Math.max(1, value)) - 1) / 9;
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const s = t / 0.5;
    r = Math.round(59 + (34 - 59) * s);
    g = Math.round(130 + (197 - 130) * s);
    b = Math.round(246 + (94 - 246) * s);
  } else {
    const s = (t - 0.5) / 0.5;
    r = Math.round(34 + (239 - 34) * s);
    g = Math.round(197 + (68 - 197) * s);
    b = Math.round(94 + (68 - 94) * s);
  }
  return `rgb(${r},${g},${b})`;
}

// brown(0) → yellow(5) → green(10+)
function fertilityColor(value: number): string {
  const t = Math.min(1, Math.max(0, value) / 10);
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const s = t / 0.5;
    r = Math.round(139 + (210 - 139) * s);
    g = Math.round(90 + (180 - 90) * s);
    b = Math.round(43 + (40 - 43) * s);
  } else {
    const s = (t - 0.5) / 0.5;
    r = Math.round(210 + (56 - 210) * s);
    g = Math.round(180 + (142 - 180) * s);
    b = Math.round(40 + (60 - 40) * s);
  }
  return `rgb(${r},${g},${b})`;
}

// ineligible → dark grey; red(≤−5) → grey(+5) → bright green(≥25)
function settlerAttractionColor(value: number): string {
  if (value === -100) return "#444444";
  let r: number, g: number, b: number;
  if (value <= -5) {
    r = 210; g = 50; b = 50;
  } else if (value <= 5) {
    const s = (value + 5) / 10;
    r = Math.round(210 + (128 - 210) * s);
    g = Math.round(50 + (128 - 50) * s);
    b = Math.round(50 + (128 - 50) * s);
  } else {
    const s = Math.min(1, (value - 5) / 20);
    r = Math.round(128 + (20 - 128) * s);
    g = Math.round(128 + (210 - 128) * s);
    b = Math.round(128 + (50 - 128) * s);
  }
  return `rgb(${r},${g},${b})`;
}

// red(0) → yellow(0.5) → green(1)
function gradientColor(t: number): string {
  const tc = Math.min(1, Math.max(0, t));
  let r: number, g: number;
  if (tc <= 0.5) {
    r = 255;
    g = Math.round(255 * (tc / 0.5));
  } else {
    r = Math.round(255 * (1 - (tc - 0.5) / 0.5));
    g = Math.round(255 - 55 * ((tc - 0.5) / 0.5));
  }
  return `rgb(${r},${g},0)`;
}

const RESOURCE_CATEGORY_COLORS: Record<ResourceCategory, string> = {
  mineral: "#c2872a",
  organic: "#3a9e4a",
  animal:  "#c8a020",
  arcane:  "#8a2be2",
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
  mapMode: MapMode;
}

export function HexGrid({ world, onHoverHex, mapMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  // Inverse of the transform used in the last draw — kept in sync with the canvas,
  // not with transformRef (which may be ahead by one RAF cycle after zoom/pan).
  const hitInverseRef = useRef<DOMMatrix | null>(null);
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

  // Build lookup: hexKey → river indices (only hexes that share a river edge)
  const riversByHexKey = useMemo(() => {
    const map = new Map<string, number[]>();
    world.rivers.forEach((river, ri) => {
      for (let ci = 0; ci < river.corners.length - 1; ci++) {
        const set1 = new Set(river.corners[ci].split("|"));
        for (const hk of river.corners[ci + 1].split("|")) {
          if (!set1.has(hk)) continue;
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

  const citiesByHexKey = useMemo(() => {
    const map = new Map<string, string>(); // hexKey → city name
    for (const city of world.cities) map.set(city.hexKey, city.name);
    return map;
  }, [world.cities]);

  // Stable region-index colours for "regions" map mode (golden-angle hue rotation)
  const regionColors = useMemo(() => {
    const map = new Map<string, string>(); // regionId → css color
    let idx = 0;
    for (const [id, region] of Object.entries(world.regions)) {
      map.set(id, region.isImpassable ? "#999999" : regionFillColor(idx++));
    }
    return map;
  }, [world.regions]);

  const populationRange = useMemo(() => {
    const vals = Object.values(world.regions)
      .filter((r) => !r.isImpassable)
      .map((r) => r.population ?? 0);
    if (vals.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { min, max: max === min ? min + 1 : max };
  }, [world.regions]);

  const wealthRange = useMemo(() => {
    const vals = Object.values(world.regions)
      .filter((r) => !r.isImpassable)
      .map((r) => r.wealth ?? 0);
    if (vals.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { min, max: max === min ? min + 1 : max };
  }, [world.regions]);

  // Main draw — reads transform and hoveredHexKey from refs, no React state deps
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y, scale } = transformRef.current;
    const hoveredHexKey = hoveredHexKeyRef.current;
    const highlightedRiverIndices = new Set<number>(
      mapMode === "rivers" ? (riversByHexKey.get(hoveredHexKey ?? "") ?? []) : [],
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

    // Capture canvas→world inverse for hit testing (tied to this frame's transform)
    const m = ctx.getTransform();
    m.invertSelf();
    hitInverseRef.current = m;

    // Draw hex fills + borders
    for (const hex of Object.values(world.hexes)) {
      const { x: hx, y: hy } = hexToPixel(hex.q, hex.r, HEX_SIZE);
      ctx.beginPath();
      ctx.moveTo(hx + corners[0].x, hy + corners[0].y);
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(hx + corners[i].x, hy + corners[i].y);
      }
      ctx.closePath();
      const hexRegion = world.regions[hex.regionId];
      ctx.fillStyle =
        mapMode === "climate" && hex.climate != null
          ? climateColor(hex.climate)
          : mapMode === "fertility" && hex.currentFertility != null
            ? fertilityColor(hex.currentFertility)
            : mapMode === "settler-attraction" && hex.currentSettlerAttraction != null
              ? settlerAttractionColor(hex.currentSettlerAttraction)
              : mapMode === "regions"
                ? (regionColors.get(hex.regionId) ?? TERRAIN_COLORS[hex.terrain])
                : mapMode === "resources"
                  ? hex.resourceId
                    ? (RESOURCE_CATEGORY_COLORS[RESOURCE_BY_ID[hex.resourceId]?.category] ?? TERRAIN_COLORS[hex.terrain])
                    : TERRAIN_COLORS[hex.terrain]
                  : mapMode === "population"
                    ? hexRegion && !hexRegion.isImpassable
                      ? gradientColor((hexRegion.population - populationRange.min) / (populationRange.max - populationRange.min))
                      : "#2a2a2a"
                    : mapMode === "wealth"
                      ? hexRegion && !hexRegion.isImpassable
                        ? gradientColor((hexRegion.wealth - wealthRange.min) / (wealthRange.max - wealthRange.min))
                        : "#2a2a2a"
                      : TERRAIN_COLORS[hex.terrain];
      ctx.fill();
      ctx.strokeStyle = "#00000033";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw impassable stripe overlay (terrain mode only)
    if (mapMode === "terrain") {
      ctx.save();
      const stripeSpacing = 5 * Math.SQRT2; // 5px perpendicular spacing
      const extent = HEX_SIZE * 3;
      ctx.strokeStyle = "rgba(80, 80, 80, 0.45)";
      ctx.lineWidth = 1.5;
      for (const hex of Object.values(world.hexes)) {
        const region = world.regions[hex.regionId];
        if (!region?.isImpassable) continue;
        const { x: hx, y: hy } = hexToPixel(hex.q, hex.r, HEX_SIZE);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(hx + corners[0].x, hy + corners[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(hx + corners[i].x, hy + corners[i].y);
        ctx.closePath();
        ctx.clip();
        for (let d = -extent * 2; d <= extent * 2; d += stripeSpacing) {
          ctx.beginPath();
          ctx.moveTo(hx - extent, hy - extent + d);
          ctx.lineTo(hx + extent, hy + extent + d);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // Pass A: solid black coastline — edge between land-terrain hex and coast hex
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "square";
    ctx.setLineDash([]);
    for (const hex of Object.values(world.hexes)) {
      const hexIsLand = LAND_TERRAIN_SET.has(hex.terrain);
      const hexIsCoast = hex.terrain === "coast";
      if (!hexIsLand && !hexIsCoast) continue;
      for (const [dq, dr] of BORDER_DIRS) {
        const nk = hexKey(hex.q + dq, hex.r + dr);
        const neighbor = world.hexes[nk];
        if (!neighbor) continue;
        const nIsLand = LAND_TERRAIN_SET.has(neighbor.terrain);
        const nIsCoast = neighbor.terrain === "coast";
        if (!((hexIsLand && nIsCoast) || (hexIsCoast && nIsLand))) continue;
        const edge = sharedEdgePixels(hex.q, hex.r, hex.q + dq, hex.r + dr);
        if (!edge) continue;
        ctx.beginPath();
        ctx.moveTo(edge.x1, edge.y1);
        ctx.lineTo(edge.x2, edge.y2);
        ctx.stroke();
      }
    }

    // Pass B: dotted region borders — all region boundaries except land/coast edges (drawn in Pass A)
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    for (const hex of Object.values(world.hexes)) {
      const hexIsLand = LAND_TERRAIN_SET.has(hex.terrain);
      const hexIsCoast = hex.terrain === "coast";
      for (const [dq, dr] of BORDER_DIRS) {
        const nk = hexKey(hex.q + dq, hex.r + dr);
        const neighbor = world.hexes[nk];
        if (!neighbor || hex.regionId === neighbor.regionId) continue;
        // Skip edges already drawn in Pass A
        const nIsLand = LAND_TERRAIN_SET.has(neighbor.terrain);
        const nIsCoast = neighbor.terrain === "coast";
        if ((hexIsLand && nIsCoast) || (hexIsCoast && nIsLand)) continue;
        const edge = sharedEdgePixels(hex.q, hex.r, hex.q + dq, hex.r + dr);
        if (!edge) continue;
        ctx.beginPath();
        ctx.moveTo(edge.x1, edge.y1);
        ctx.lineTo(edge.x2, edge.y2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

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

    // Draw city huts (on top of all layers, every map mode)
    for (const [hk] of citiesByHexKey) {
      const hex = world.hexes[hk];
      if (!hex) continue;
      const { x: cx, y: cy } = hexToPixel(hex.q, hex.r, HEX_SIZE);
      const s = transformRef.current.scale;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1 / s, 1 / s); // screen-space constant size

      const bw = 10; // body width
      const bh = 7;  // body height
      const rh = 6;  // roof height

      // Roof (triangle)
      ctx.beginPath();
      ctx.moveTo(0, -(bh / 2 + rh));
      ctx.lineTo(bw / 2 + 1, -bh / 2);
      ctx.lineTo(-(bw / 2 + 1), -bh / 2);
      ctx.closePath();
      ctx.fillStyle = "#c0392b";
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Body (rectangle)
      ctx.fillStyle = "#f5f0e8";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

      // Door
      ctx.fillStyle = "#8b6914";
      ctx.fillRect(-1.5, bh / 2 - 4, 3, 4);

      ctx.restore();
    }

    ctx.restore();
  }, [world, bounds, corners, riverPoints, riversByHexKey, mapMode, citiesByHexKey, regionColors, populationRange, wealthRange]);

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

      // Hit-test: map mouse CSS pixels → canvas pixels → world coords via stored inverse
      const canvas = canvasRef.current;
      if (!canvas) return;
      const hit = hitInverseRef.current;
      if (!hit) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const worldPt = hit.transformPoint({
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
      });
      const { q, r } = pixelToHex(worldPt.x, worldPt.y, HEX_SIZE);
      const hk = hexKey(q, r);
      const next = world.hexes[hk] ? hk : null;
      if (next !== hoveredHexKeyRef.current) {
        hoveredHexKeyRef.current = next;
        onHoverHex?.(next);
        scheduleDraw();
      }
    },
    [world.hexes, scheduleDraw],
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
