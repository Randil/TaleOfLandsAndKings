# PRD: Large Rivers — Tributary Widening & Lake-Source Rivers

## Overview

Introduce the concept of **large rivers**: river segments that carry more water
than ordinary rivers and are visually distinguished on the map by **double
stroke width**. A river becomes large at the point where it receives a
tributary, and remains large from that point onward to its terminus. Rivers
that originate directly from a lake are large for their entire length.

---

## Motivation

All rivers currently render at the same visual weight regardless of whether
they are a headwater trickle or a major waterway fed by several tributaries.
This flattens the geography and makes the map harder to read — players cannot
glance at the map and identify the principal drainage arteries of a continent.

Two natural rules already exist in the data model:

1. A river can terminate by joining an existing river (tributary junction) — the
   point where two rivers meet is already encoded as a shared corner key.
2. Lake-outlet rivers already spawn from lake groups — lakes are the
   highest-flow sources on the map.

Encoding these rules as a width distinction requires only a single new optional
field on `River` and a post-processing pass after generation — no changes to
the tracing algorithm.

---

## Definitions

| Term | Definition |
|---|---|
| **Large river** | A river (or segment of a river) whose stroke width is 3 px on the canvas (double the standard 1.5 px). |
| **Small river** | Any river segment that has not yet received a tributary and does not originate from a lake. Rendered at 1.5 px. |
| **Tributary junction** | A corner key that is the **last corner** of one river and also appears somewhere in the corner list of another river. The second river receives the first as a tributary at that corner. |
| `largeFromIndex` | Zero-based index into a river's `corners` array. All corners from this index onward (inclusive) are drawn as large. |

---

## Rules

### Rule 1 — Lake source

If the **first corner** of a river touches at least one `lake`-terrain hex, the
river is large for its entire length.

```
largeFromIndex = 0
```

This covers both rivers started directly by the main river loop (where `lake`
is a valid source terrain) and rivers spawned by `spawnLakeOutlet`.

### Rule 2 — Tributary junction

For each river A, scan its corners from index 0 onward. The first corner that
is the **last corner of any other river** (i.e. another river ended by merging
into river A at that point) is where river A becomes large.

```
largeFromIndex = first index i such that corners[i] is the terminal corner
                 of at least one other river
```

If both rules apply, Rule 1 wins because it produces the lower index (0).

### Rule 3 — No large classification

If neither rule fires, `largeFromIndex` is left `undefined` and the river is
rendered entirely at normal width.

---

## Data Model Change

`src/types/world.ts` — add one optional field to `River`:

```typescript
export interface River {
  id: string;
  corners: HexCornerKey[];
  largeFromIndex?: number; // index from which river is "large"; 0 = entire river
}
```

`largeFromIndex` is omitted (undefined) when the river is entirely small.
Existing saved worlds that lack the field degrade gracefully — the renderer
treats `undefined` as "entirely small".

---

## Generation Change

`src/game/mapGen.ts` — one post-processing pass appended to `generateRivers`,
after the full `rivers` array is assembled:

1. **Build a terminal-corner index.**
   Iterate all rivers. For each river, record its last corner key in a
   `Map<cornerKey, riverIndex[]>`.

2. **Classify each river.**
   For each river `A` (index `ri`):

   a. Look up the three hexes adjacent to `corners[0]` via `cornerMap`.
      If any has terrain `lake` → set `largeFromIndex = 0`, continue to
      next river.

   b. Walk `corners` from index `0`. At each index `i`, check the terminal-
      corner index: if any river other than `A` ends there → set
      `largeFromIndex = i`, break.

   c. If neither condition fired, leave `largeFromIndex` unset.

No changes to `traceRiverCorners`, `spawnLakeOutlet`, or
`handleLoopLake` — this is purely additive post-processing.

---

## Rendering Change

`src/components/HexGrid.tsx` — update the river draw passes to respect
`largeFromIndex`.

### Stroke widths

| Segment | Normal pass | Highlighted (hover) pass |
|---|---|---|
| Small section | 1.5 px | 2 px |
| Large section | 3 px | 4 px |

### Drawing logic (per river)

```
pts       = pre-computed pixel points array
lfi       = river.largeFromIndex
isLarge   = lfi !== undefined

if !isLarge:
  draw pts[0..end] at small width

else if lfi === 0:
  draw pts[0..end] at large width

else:
  draw pts[0..lfi]   at small width   // headwater
  draw pts[lfi..end] at large width   // from junction onward
```

The junction corner (`pts[lfi]`) is included in both segments so there is no
visual gap at the transition point.

The existing highlighted-river draw pass follows the same split, substituting
highlighted widths (2 / 4) for normal widths (1.5 / 3).

---

## Changes Required

| File | Change |
|---|---|
| `src/types/world.ts` | Add `largeFromIndex?: number` to `River` interface |
| `src/game/mapGen.ts` | Post-processing pass at end of `generateRivers` to compute and assign `largeFromIndex` |
| `src/components/HexGrid.tsx` | Split river draw path per `largeFromIndex`; apply double width to large segments |

No changes required to `WorldGenPanel.tsx`, `hexMath.ts`, or any store/type
files beyond the one field addition.

---

## Acceptance Criteria

- [ ] `River` interface has `largeFromIndex?: number`; field is optional and
      backward-compatible
- [ ] A river whose first corner touches a `lake` hex has `largeFromIndex = 0`
- [ ] Lake-outlet rivers (spawned by `spawnLakeOutlet`) satisfy the lake-source
      rule and are fully large
- [ ] A river that receives at least one tributary has `largeFromIndex` set to
      the earliest junction corner index
- [ ] A river with no tributary and no lake origin has `largeFromIndex`
      `undefined` and renders at normal width
- [ ] Large segments render at 3 px stroke width; small segments at 1.5 px
- [ ] The transition between small and large is seamless (no gap at the
      junction corner)
- [ ] Highlighted (hovered) rivers use 2 px / 4 px for small / large
      respectively
- [ ] Generation remains fully deterministic given the same `WorldConfig.seed`
- [ ] Loaded saved worlds that lack `largeFromIndex` render without errors
      (entirely small width)
