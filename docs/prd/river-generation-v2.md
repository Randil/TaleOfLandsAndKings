# PRD: River Generation v2 — Corner-Based Rivers

## Overview

Replace the current edge-list river model with a corner-point model. Rivers are
represented as ordered sequences of **hex corners** (points where exactly 3 hexes
meet). The river flows along the shared edge between each successive pair of
corners. This produces rivers that naturally hug terrain boundaries, branch
cleanly, and join without overlap.

---

## Motivation

The previous model stored rivers as a flat list of `RiverEdge` pairs. This made
it difficult to:
- detect when two rivers share a stretch of the same edge
- render rivers as continuous stroked paths
- enforce no-duplicate-flow rules during generation

Corner-based rivers solve all three: two rivers sharing a corner means they
**meet**, not overlap, and the ordered corner list is trivially converted to an
SVG polyline for rendering.

---

## Data Model

### HexCorner

A corner is the unique point where exactly 3 hexes meet. It is identified by the
**canonical sorted tuple** of those 3 hex keys (`"${q},${r}"`).

```ts
// Canonical key: sorted hex keys joined, e.g. "0,0|0,1|1,0"
type HexCornerKey = string;

interface HexCorner {
  key: HexCornerKey;          // canonical identifier
  hexes: [string, string, string]; // sorted hex keys of the 3 adjacent hexes
}
```

Two corners are **adjacent** if they share exactly 2 of their 3 hexes (i.e. they
are connected by the edge between those 2 shared hexes). Each corner has exactly
3 adjacent corners.

### River (updated)

```ts
interface River {
  id: string;
  corners: HexCornerKey[]; // ordered path — each consecutive pair shares an edge
}
```

`World.rivers: River[]` is unchanged; only the shape of `River` changes.

### Region / Hex

No changes to `Hex` or `Region`. The `lake` and `water` terrains already exist
and drive river termination logic.

---

## Generation Algorithm

Generation is a pure function added to `src/game/mapGen.ts` (or a dedicated
`src/game/riverGen.ts`):

```ts
function generateRivers(world: World, rng: RNG): River[]
```

### Step 1 — Enumerate corners

Walk every hex in the grid and emit its 6 corners. Store each corner once,
keyed by its canonical `HexCornerKey`. For each corner, record which 3 hexes
share it, and precompute the 3 adjacent corner keys.

Corner enumeration for a flat-top hex at axial `(q, r)`:
each hex contributes two "upper" corners (the two that aren't already owned by
neighbors above). In practice, iterate all hexes and for each of the 6 corner
directions, compute the canonical triplet.

### Step 2 — Find candidate start corners

A corner is a **valid start** if:
- at least one of its 3 hexes has terrain `mountains`, `hills`, or `lake`, **and**
- it is **not** already part of an existing river (rivers always originate from
  terrain sources, never by splitting off an existing river)

Collect all valid starts into a list, then shuffle with the seeded RNG.

### Step 3 — Grow the river

```
river = []
visited = new Set<HexCornerKey>()  // corners already in this river

current = pick next unused valid start
river.push(current)
visited.add(current)

loop:
  neighbors = adjacentCorners(current)
    .filter(c => !visited.has(c))            // no cycles
    .filter(c => !isAlreadyOnAnyRiver(c))    // don't cross existing rivers*

  if neighbors is empty → stop (dead end)

  // Termination: if the best neighbor touches a lake or ocean, add it and stop
  terminators = neighbors.filter(c => touchesLakeOrOcean(c))
  if terminators is non-empty:
    river.push( pick one terminator with rng )
    stop

  // Termination: if a neighbor is already the start/end of another river, merge
  // Termination: if a neighbor is already on any river, flow into it and stop
  // (this river becomes a tributary of the existing one)
  junctions = neighbors.filter(c => isOnAnyRiver(c))
  if junctions is non-empty:
    river.push( rng.pick(junctions) )
    stop

  // Normal step: random
  current = rng.pick(neighbors)
  river.push(current)
  visited.add(current)
```

\* "already on any river" means the corner appears in the `corners` list of any
previously generated `River`. A river **may** end at such a corner (flowing into
an existing river as a tributary), but cannot originate from one, and cannot
continue past one.

### Step 4 — Discard short rivers

Discard any river with fewer than **3 corners** (too short to render meaningfully).

### Step 5 — Repeat

Continue picking start corners (step 2 shuffled list) until the desired river
count is reached or no valid starts remain. `hexesPerRiver` in `WorldConfig`
controls how many rivers are attempted: `numRivers = floor(totalLandHexes / hexesPerRiver)`.

---

## Termination Rules (summary)

| Condition | Action |
|---|---|
| No valid neighbors remain | Stop (dead end) |
| Neighbor touches `lake` or `water` terrain | Add corner, stop |
| Neighbor is already on an existing river | Add corner, stop (tributary joins river) |
| Neighbor is already in **this** river | Skip — try another neighbor (cycle prevention) |
| Start corner is already on a river | Skip as candidate start entirely |

---

## Corner Math (flat-top axial hex)

Each hex `(q, r)` has 6 corners. In flat-top orientation the corners alternate
between "top" (shared with the row above) and "bottom" types. A corner's 3
adjacent hexes can be derived from the axial neighbor directions:

```
Axial neighbor directions (flat-top):
  E  = (+1,  0)
  NE = (+1, -1)
  NW = ( 0, -1)
  W  = (-1,  0)
  SW = (-1, +1)
  SE = ( 0, +1)

Corner triplets for hex (q, r) — 6 corners:
  corner_NE: (q,r), (q+1,r-1), (q+1, r  )   → direction pair (NE, E)
  corner_N : (q,r), (q+1,r-1), (q,   r-1)   → direction pair (NE, NW)
  corner_NW: (q,r), (q,  r-1), (q-1, r  )   → direction pair (NW, W)
  corner_SW: (q,r), (q-1,r  ), (q-1, r+1)   → direction pair (W,  SW)
  corner_S : (q,r), (q-1,r+1), (q,   r+1)   → direction pair (SW, SE)
  corner_SE: (q,r), (q,  r+1), (q+1, r  )   → direction pair (SE, E)
```

Canonical key: sort the 3 hex keys lexicographically and join with `|`.

Two corners are adjacent iff their hex-triplets share exactly 2 hexes.

---

## Pixel Coordinates for Rendering

A corner's SVG pixel position is the **centroid of its 3 hex centers**:

```ts
function cornerToPixel(corner: HexCorner, hexes: Record<string, Hex>): Point {
  const pts = corner.hexes.map(k => hexToPixel(hexes[k]));
  return {
    x: (pts[0].x + pts[1].x + pts[2].x) / 3,
    y: (pts[0].y + pts[1].y + pts[2].y) / 3,
  };
}
```

Rivers render as SVG `<polyline>` paths connecting the pixel positions of their
corner sequence.

---

## Changes Required

| File | Change |
|---|---|
| `src/types/world.ts` | Replace `RiverEdge` / `River` with `HexCornerKey` / updated `River` |
| `src/game/mapGen.ts` or new `src/game/riverGen.ts` | Implement `enumerateCorners`, `generateRivers` |
| `src/game/hexMath.ts` | Add `hexCorners(q,r)`, `adjacentCorners(key)`, `cornerToPixel` |
| `src/components/HexGrid.tsx` | Render rivers as `<polyline>` over corner pixel coords |

---

## Acceptance Criteria

- [ ] `River.corners` is an ordered list of `HexCornerKey` values
- [ ] Every river starts at a corner adjacent to a mountain, hill, or lake hex
- [ ] Rivers terminate when they reach a lake or ocean-adjacent corner
- [ ] Rivers terminate when they reach a corner already on another river
- [ ] No river contains a cycle (no corner appears twice in the same river)
- [ ] No two rivers share an interior corner (junctions only at endpoints)
- [ ] Rivers with fewer than 3 corners are discarded
- [ ] Generation is deterministic given the same `WorldConfig.seed`
- [ ] Rivers render as continuous stroked paths in the map SVG
