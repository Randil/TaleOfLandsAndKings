# PRD: River Generation v3 — Terrain-Descent Bias & Lake Outlets

## Overview

Improve river pathing so that rivers flow naturally downhill toward the coast.
Replace the purely random corner walk with a **terrain-descent bias**: at each
step, prefer directions whose surrounding terrain is lower. Additionally,
introduce **lake outlet rivers** — when a river terminates in a lake, there is an
80% chance a new river immediately spawns from somewhere else on that same lake,
continuing the drainage chain toward the ocean.

---

## Motivation

v2 rivers are random walks with no directional preference. They frequently:

- Wander in circles until the cycle-prevention deadlock fires
- Terminate at a mid-land tributary junction far from any water body
- Hit the 300-step hard cap on large maps

The result looks unnatural: rivers meander arbitrarily and sometimes dead-end
inland. Real rivers always flow downhill. Encoding a terrain height value per
hex and biasing the walk toward lower values produces rivers that behave
credibly without requiring a full elevation model.

Lake outlets address a related problem: inland lakes are realistic collection
points for mountain runoff, but the current system treats them as dead ends.
In reality a lake has an outflow that continues toward the ocean.

---

## Terrain Height Values

Each terrain type is assigned an integer height used exclusively for river
direction scoring. Lower is "more downhill".

| Terrain      | Height value |
| ------------ | ------------ |
| `mountains`  | 5            |
| `hills`      | 3            |
| `plains`     | 1            |
| `lake`       | 1            |
| `forest`     | 1            |
| `desert`     | 1            |
| `coast`      | 1            |
| `water`      | 0            |

Any hex key not found in the hex map (off-grid) is treated as `water` → 0.

---

## Corner Score

A **corner** sits at the intersection of 3 hexes. To score a candidate next
corner, consider all hexes that are "close" to it: the 3 hexes the corner
itself touches, plus the 3 additional hexes that each of those hexes touches
(their non-shared neighbors). This gives up to **12 unique hexes** in the
corner's influence zone (duplicates discarded).

```
cornerScore(c) = sum of height(h) for all h in influenceZone(c)

influenceZone(c) = union of:
  - the 3 hexes adjacent to c
  - for each of those 3 hexes, their 6 axial neighbors
  (capped at 12 unique hexes; off-grid hexes score 0)
```

Because the 3 hexes of the corner each contribute their own 6 neighbors,
the zone extends one hex-ring outward from the corner, giving the score
a meaningful spatial signal without being overly global.

---

## Direction Selection

At each step of the river walk, the candidates are the 1–3 non-visited adjacent
corners. Score each candidate with `cornerScore`. Then:

1. Find the **minimum score** among candidates.
2. Collect all candidates with that minimum score (ties).
3. Pick uniformly at random from the tie group using the seeded RNG.

This preserves randomness when terrain is flat while still pulling the river
downhill on varied terrain.

The terminal and junction checks from v2 are evaluated **before** the descent
scoring, in the same priority order:

1. If any non-visited neighbor touches `lake` or `water` → pick one at random
   and terminate. *(Water found — stop immediately.)*
2. If any non-visited neighbor is already on another river → pick one at random
   and terminate. *(Tributary junction — stop.)*
3. Otherwise → apply descent scoring to the remaining candidates.

---

## Lake Outlet Rivers

When a river terminates because its final corner touches a `lake` hex:

1. With **80% probability**, attempt to spawn a new river.
2. Identify the **lake group**: the set of all `lake`-terrain hexes that are
   connected to the terminating lake hex (flood-fill over `lake` terrain).
3. Collect all corners in `cornerMap` that:
   - touch at least one hex in the lake group, **and**
   - are not already on any river (not in `allRiverCorners`).
   - Prefer corners that also touch another `lake` hex (not just a land hex
     neighboring the lake) — sort these to the front of the candidate list.
4. Pick the first available candidate (after shuffling within the preferred
   and non-preferred sub-lists separately) and start a new river trace from
   it, using the same descent-bias algorithm.
5. If the new river has ≥ 3 corners, add it to the output. The spawned river
   counts toward the `targetCount` for the current landmass.
6. The spawned river can itself terminate in a lake and trigger another outlet
   (chain), but to prevent infinite loops apply a **maximum chain depth of 5**
   per original river.

---

## Changes Required

| File                   | Change                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/game/mapGen.ts`   | Add `TERRAIN_HEIGHT` map; replace random next-corner pick with scored descent pick in `traceRiverCorners`   |
| `src/game/mapGen.ts`   | Add `cornerScore` helper that computes influence-zone sum                                                    |
| `src/game/mapGen.ts`   | Add lake-outlet logic in `generateRivers` after a river terminates in a lake                                 |
| `src/game/mapGen.ts`   | Pass lake-group lookup into `traceRiverCorners` or handle in the `generateRivers` call site                  |
| `src/game/hexMath.ts`  | No changes required — `adjacentCornerTriplets` and `hexNeighbors` are sufficient                             |
| `src/types/world.ts`   | No changes required                                                                                          |
| `src/components/`      | No changes required                                                                                          |

---

## Acceptance Criteria

- [ ] `TERRAIN_HEIGHT` values match the table above; off-grid hexes score 0
- [ ] `cornerScore` sums heights over the correct ≤12-hex influence zone
- [ ] At each step the river picks the lowest-scoring candidate; ties broken randomly
- [ ] Terminal and junction checks still fire before descent scoring
- [ ] Rivers still discard if fewer than 3 corners
- [ ] When a river ends on a lake corner, there is an ~80% chance a new river
      spawns from the same lake group
- [ ] Spawned outlet rivers prefer starting corners that touch a lake hex
- [ ] Lake outlet chains are capped at depth 5 to prevent infinite loops
- [ ] Generation remains fully deterministic given the same `WorldConfig.seed`
- [ ] No regression in rendering — rivers still display as continuous stroked
      paths on the canvas
