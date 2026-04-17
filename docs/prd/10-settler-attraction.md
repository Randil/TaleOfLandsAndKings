# PRD 10: Settler Attraction System

## Overview

Assign each hex a `settlerAttraction` value (integer, −100 to 100) computed once after fertility generation at world-generation time. This value represents how desirable a hex is for founding a settlement. It will later drive city/town spawning logic and will fluctuate as towns emerge and alter local dynamics. A dedicated map mode visualises attraction as a colour gradient, and the hex inspector displays the value at all times.

---

## Data Model

Add to the `Hex` type:

```ts
settlerAttraction?: number; // integer, −100 (ineligible) to 100 (capped)
```

---

## Generation Pipeline

Runs as a new `SettlerAttractionGenerator` pass immediately after `FertilityGenerator`. Steps execute in order on a working value per hex. After all steps the value is clamped to [−100, 100].

### Step 1 — Ineligible Tiles

Coast (`terrain === "coast"`), sea (`terrain === "water"`), and lake (`terrain === "lake"`) tiles are **ineligible for settlement**. Set `settlerAttraction = −100` and skip all remaining steps.

### Step 2 — Own Fertility Seed

Start the working value from the hex's own `currentFertility`.

```
value = currentFertility
```

### Step 3 — Neighbourhood Fertility Average

Compute the average `currentFertility` of all hexes within radius 3 (rings 1–3, not including the centre hex). Only count hexes that exist within map boundaries — ignore out-of-bounds coordinates. Round the average **up** (`Math.ceil`). Add to working value.

```
value += ceil(averageFertilityWithinRadius3)
```

### Step 4 — Climate Modifier

| Climate value | Delta |
|---------------|-------|
| 4–7           | +1    |
| 3 or 9        | −1    |
| 10            | −2    |
| 1             | −4    |
| All others    | 0     |

### Step 5 — Mountain Penalty

| Terrain   | Delta |
|-----------|-------|
| Mountains | −1    |

### Step 6 — Fresh Water Bonus

A hex has **fresh water** if it borders any river (`riverSize` is set) **or** any of its neighbours has `terrain === "lake"`.

| Condition                      | Delta |
|-------------------------------|-------|
| Has fresh water                | +2    |

### Step 7 — River Bonus

| Condition                          | Delta               |
|------------------------------------|---------------------|
| Hex itself borders a river (`riverSize` is set) | +2 (stacks with step 6) |

### Step 8 — Coastal Bonus

A hex is **coastal** if any of its neighbours has `terrain === "coast"` or `terrain === "water"`.

| Condition    | Delta |
|--------------|-------|
| Coastal hex  | +1    |

### Step 9 — Good Harbour Bonus

A hex qualifies as a **good harbour** if it is coastal (step 8) AND at least one of its neighbouring coast/water tiles has **at most 2** neighbours that are themselves coast or water tiles.

| Condition        | Delta |
|-----------------|-------|
| Good harbour     | +2 (stacks with step 8) |

### Step 10 — Defensible Position Bonus

A hex is **easy to defend** if **either** of the following is true:

- **Peninsula**: the hex has at most 2 neighbours whose terrain is not coast/water (i.e. at most 2 land neighbours).
- **Mountain fortress**: at least 3 of the hex's neighbours have `terrain === "mountains"`.

| Condition              | Delta |
|------------------------|-------|
| Easy to defend         | +3    |

### Step 11 — Clamp

```
settlerAttraction = clamp(value, −100, 100)
```

---

## Map Mode: Settler Attraction

Add a **Settler Attraction** map mode alongside existing terrain/climate/fertility modes.

- Ineligible tiles (`settlerAttraction === −100`) are rendered in a flat **dark grey** (#444).
- All other tiles are colour-interpolated along the gradient **red (−50) → grey (0) → green (50+)**. Values below −50 map to full red; values above 50 map to full green.
- Map mode available in the existing map-mode selector dropdown.

---

## Hex Inspector

Regardless of active map mode, display `settlerAttraction` on the hex inspector panel.

Format: `Settler Attraction: <value>` (e.g. `Settler Attraction: 14`). Ineligible tiles show `Settler Attraction: ineligible`.

---

## Future Work (out of scope for this PRD)

- City/town spawning driven by attraction scores.
- `settlerAttraction` mutations when a new town is founded nearby (attraction penalty within radius, access bonus to adjacent hexes).
- Player-visible map overlays for candidate founding sites.
- Seasonal or event-driven attraction shifts.
