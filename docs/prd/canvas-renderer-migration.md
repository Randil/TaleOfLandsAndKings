# PRD: Canvas 2D Map Renderer Migration

## Goal

Replace the SVG hex grid with a Canvas 2D renderer to eliminate per-hex DOM overhead and enable smooth interaction on maps up to 500×500.

## Background

The original renderer created one SVG `<polygon>` element per hex and one `<polyline>` per river. At 80×50 that is ~4000 DOM nodes; at larger map sizes this causes sluggish pan/zoom and layout thrashing. Canvas 2D draws everything imperatively with zero DOM nodes, resolving the bottleneck.

## In Scope

- Rewrite `HexGrid.tsx` to render onto a `<canvas>` element
- Preserve all current visual output: terrain fill colors, hex borders, rivers, river hover highlighting
- Preserve all current interactions: pan (drag), zoom (scroll wheel), hex hover
- Add `pixelToHex` inverse function to `hexMath.ts` for mouse hit-testing
- HiDPI / retina support via `devicePixelRatio`

## Out of Scope

- Region labels / text rendering
- Animated effects
- Multiple canvas layers
- Any changes to map generation or game state

## Acceptance Criteria

1. Map renders visually identically to the previous SVG output at default zoom
2. Pan and zoom behave the same as before
3. Hovering a hex highlights its connected rivers, same as before
4. No SVG elements remain in the map rendering path
5. No regression on load-from-file or generate flows
6. Renders without visual artefacts on a retina / HiDPI display

## Files Changed

| File | Change |
|---|---|
| `src/components/HexGrid.tsx` | Full rewrite — `<svg>` replaced by `<canvas>`, imperative draw loop |
| `src/game/hexMath.ts` | Added `pixelToHex` (inverse of `hexToPixel`, cube-rounded) |

## Implementation Notes

- A `ResizeObserver` keeps canvas pixel dimensions in sync with its CSS size, accounting for `devicePixelRatio`.
- The draw function is a `useCallback` that re-runs on world, transform, or hover state change via `useEffect`.
- Mouse hit-testing inverts the canvas transform to world-space coords, then calls `pixelToHex` and checks the hexes map. No per-element event listeners needed.
- River point arrays are pre-computed with `useMemo` to avoid recomputing on every hover redraw.
- Pan/zoom state shape (`{ x, y, scale }`) is unchanged; applied via `ctx.translate` / `ctx.scale` instead of an SVG `transform` attribute.
