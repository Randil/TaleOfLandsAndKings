# PRD: Landmass Generation v3 — Hierarchical Seeded Growth

## Overview

Replace the single-pass random-walk landmass generator with a three-phase
hierarchical approach. Large continental cores are placed first, medium island
clusters grow near them, and small scattered islands fill the remaining land
quota. The result is maps that read as geographically plausible — broad
continents with nearby archipelagos and distant scattered outcroppings — rather
than the uniform-blob output of v1/v2.

---

## Motivation

`landmass-growth` and `landmass-growth-v2` both call the same underlying
`landmassGrowthGen` function, differing only by a `peninsulaAvoidance` flag.
The growth itself is a single loop: pick a random seed hex, grow a blob of
random size up to 5% of the map, repeat until land coverage is met.

Problems with the current approach:
- Landmasses are statistically uniform in size — no large continents, no sense
  of scale.
- Medium and small islands are indistinguishable from each other.
- There is no geographic relationship between landmasses; they are scattered
  purely at random.

v3 introduces **intentional structure**: big continents anchor geography, medium
landmasses cluster around them, and small islands scatter freely.

---

## Cleanup Required (pre-v3)

`landmass-growth` passes `peninsulaAvoidance: false` and `landmass-growth-v2`
passes `peninsulaAvoidance: true` to the same `landmassGrowthGen` function.
The UI shows both as distinct algorithms. Before adding v3:

- Rename `landmass-growth-v2` → `landmass-growth` and make peninsula avoidance
  the permanent default behaviour. There is no reason to offer the non-avoidance
  variant as a separate option.
- Remove the old `landmass-growth` (no avoidance) entry from `MapGenAlgorithm`,
  the `ALGORITHMS` list in `WorldGenPanel.tsx`, and the `switch` in `generateWorld`.
- Drop the `peninsulaAvoidance` boolean parameter from `landmassGrowthGen` — it
  is now always `true` and the branch can be inlined.

---

## Algorithm: Three-Phase Hierarchical Growth

### Inputs (from `WorldConfig`)

All existing `WorldConfig` fields apply unchanged. The algorithm uses:

- `width`, `height` — map dimensions
- `seed` — deterministic RNG seed
- `minLandFraction` — target land coverage (e.g. 0.35 for 35%)

No new config fields are required for the base implementation; phase size ranges
are constants internal to the function.

### Definitions

- `totalHexes` = total hex count for the map dimensions
- `targetLandHexes` = `floor(totalHexes × minLandFraction)`

---

### Phase 1 — Continental Cores (Big Landmasses)

**Goal:** Establish 3–5 large continental anchors.

**Count:** `rngInt(rng, 3, 5)`

**Size per landmass:** `rngInt(rng, floor(targetLandHexes × 0.02), floor(targetLandHexes × 0.05))`
— i.e. 2–5% of the total *expected* land area per continent.

**Placement:** Seed hexes are chosen uniformly at random across the full map,
with no proximity constraint between continents.

**Growth:** Standard BFS frontier expansion (same as the existing growth loop):

```
frontier = [seedHex]
visited = {seedHex}
added = 0

while frontier not empty and added < size:
  pick random hex from frontier, remove it
  if hex is water: landCount++
  apply ELEVATION[current terrain]
  add unvisited in-bounds neighbors to frontier
  added++
```

Peninsula avoidance is applied in all three phases (same re-roll logic as the
cleaned-up `landmassGrowthGen`): when the randomly selected frontier hex has
only one land neighbour, re-roll once before accepting. This keeps coastlines
from producing thin spits even on large continental masses.

---

### Phase 2 — Coastal Clusters (Medium Landmasses)

**Goal:** Add 5–20 medium landmasses positioned near Phase 1 continents,
creating the visual effect of archipelagos and continental shelves.

**Count:** `rngInt(rng, 5, 20)`

**Size per landmass:** `rngInt(rng, 20, floor(totalHexes × 0.01))`
— at least 20 hexes, at most 1% of *total map* hexes.

**Placement — proximity seeding:**
1. Collect all Phase 1 land hexes into a list.
2. Pick a random Phase 1 land hex as the **anchor**.
3. Pick the seed hex uniformly within a **proximity radius** of that anchor.
   Radius = `floor(sqrt(totalHexes) × 0.15)` (scales with map size; roughly
   15% of the map's geometric mean dimension).
4. If the randomly chosen seed hex is out of bounds, re-roll up to 10 times;
   if still invalid after 10 attempts, fall back to a fully random seed hex.

The intent is overlap or near-adjacency with existing land — the medium
landmass may partially merge with a continent, extending it, or land just
offshore as an island.

**Growth:** Same BFS frontier expansion as Phase 1.

---

### Phase 3 — Scatter Islands (Small Landmasses)

**Goal:** Fill remaining land coverage with small, randomly placed islands.

**Trigger:** Loop until `landCount / totalHexes >= minLandFraction`.

**Size per landmass:** `rngInt(rng, 1, 20)` hexes.

**Placement:** Seed hex chosen uniformly at random across the full map (same as
the existing v1/v2 behavior).

**Growth:** Same BFS frontier expansion.

---

### Post-Processing (unchanged)

After all three phases complete, the pipeline runs exactly as today:

1. `detectLakes` — flood-fill from map boundary to identify inland water bodies;
   groups ≤ 15 hexes become `lake` terrain.
2. `generateRivers` — unchanged river generation.
3. Build `hexes`, `regions`, `rivers` records and return `World`.

---

## Changes Required

| File | Change |
|---|---|
| `src/types/world.ts` | Add `"landmass-growth-v3"` to `MapGenAlgorithm`; remove the old `"landmass-growth"` (no-avoidance) entry; `"landmass-growth-v2"` is renamed to `"landmass-growth"` |
| `src/game/mapGen.ts` | Inline peninsula avoidance as always-on in `landmassGrowthGen`; drop the `peninsulaAvoidance` param; remove the old no-avoidance `landmass-growth` case; add `landmassGrowthV3` function and wire it into `generateWorld` |
| `src/components/WorldGenPanel.tsx` | Remove old `landmass-growth` entry from `ALGORITHMS`; relabel `landmass-growth-v2` → `landmass-growth`; add `landmass-growth-v3` |

---

## Acceptance Criteria

- [ ] The old `landmass-growth` (no peninsula avoidance) is removed from all code and UI
- [ ] `landmass-growth` now always uses peninsula avoidance (formerly v2 behaviour)
- [ ] `landmass-growth-v3` is available in the algorithm dropdown
- [ ] Generated maps consistently contain 3–5 large continental blobs
- [ ] Generated maps consistently contain 5–20 medium landmasses, visually
      clustered near the large continents
- [ ] Remaining land quota is filled with 1–20 hex scatter islands
- [ ] Total land coverage meets `minLandFraction` (within rounding)
- [ ] Generation is deterministic: same seed + config produces the same map
- [ ] `detectLakes` and `generateRivers` run unchanged after v3 land generation
- [ ] No new `WorldConfig` fields are required
