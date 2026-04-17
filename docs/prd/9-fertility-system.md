# PRD 9: Fertility System

## Overview

Assign each hex a `baseFertility` (computed once from map seed) and a `currentFertility` (mutable during gameplay, initialised to `baseFertility`) during world generation. Fertility represents the hex's capacity to support life. It has no upper bound; land hexes floor at 0 and ocean hexes floor at 2. Fertility is computed in a layered pipeline applied after climate generation. A dedicated map mode visualises fertility as a brown-to-yellow-to-green colour gradient.

---

## Data Model

Add to the hex type:

```ts
baseFertility: number;    // integer, set once at world generation, never mutated
currentFertility: number; // integer, initialised to baseFertility, may change during gameplay
```

---

## Generation Pipeline

Steps execute in order on a working value per hex. After all steps, apply floor values. Assign the clamped result to both `baseFertility` and `currentFertility`.

### Step 1 — Climate Base

Every hex receives an initial fertility derived from its `climate` value.

```
fertility = 5 - abs(6 - climate)
```

Climate 6 is considered ideal (fertility 5). Every step away from 6 removes 1.

| Climate | Initial Fertility |
|---------|------------------|
| 1       | 0                |
| 2       | 1                |
| 3       | 2                |
| 4       | 3                |
| 5       | 4                |
| 6       | 5                |
| 7       | 4                |
| 8       | 3                |
| 9       | 2                |
| 10      | 1                |

### Step 2 — Ocean Bonus

Apply to ocean hexes only:

| Condition           | Delta |
|---------------------|-------|
| Ocean, climate ≤ 3  | +2    |

### Step 3 — Coast Bonus

A hex is a coast if it is a sea tile with Coast terrain type (near-land seas)

| Condition                       | Delta |
|---------------------------------|-------|
| Any coast                       | +2    |
| Cold coast (climate ≤ 4)        | +1 additional |

### Step 4 — River Adjacency

Rivers adjacency is already a hex parameter.

Apply the highest applicable tier per hex:

| Condition                                                        | Delta |
|------------------------------------------------------------------|-------|
| Hex is adjacent to any river                                     | +1    |
| Hex is adjacent to a big or very big river                       | +2 (replaces +1) |
| Hex is not adjacent to any river but borders a hex that is adjacent to a very big river | +1    |

### Step 5 — Lake Bonus

| Condition    | Delta |
|--------------|-------|
| Hex is a lake | +3   |

### Step 6 — Mountain Penalty

| Terrain   | Delta |
|-----------|-------|
| Mountains | −3    |

### Step 7 — Hot Climate Freshwater Bonus

Freshwater proximity means: adjacent to any river **or** adjacent to a lake hex.

| Condition                                  | Delta |
|--------------------------------------------|-------|
| Climate 7–8 and has freshwater proximity   | +1    |
| Climate 9–10 and has freshwater proximity  | +3    |

### Step 8 — Random Fertility Zones

Grow zones using the same random-neighbour flood-fill used by the climate system (pick a seed hex, repeatedly add a random unvisited neighbour). Target size per zone: **2–5% of total hex count** (pick a random integer in that range per zone, independently).

Spawn the following zones in order:

1. **20 high-fertility zones** — each applies **+1** to every hex within the zone
2. **20 low-fertility zones** — each applies **−1** to every hex within the zone

Zones of the same or different sign may overlap; all modifiers stack additively. Zones can grow over land or sea with no restriction on seed tile placement.

### Step 9 — Floor

Apply floor values after all modifiers:

| Hex type | Minimum fertility |
|----------|-------------------|
| Ocean, coast    | 2                 |
| All others | 0               |

---

## Stacking

All modifiers are additive with no priority ordering between steps 2–7. Zone modifiers (step 8) are applied last and can produce high or low outliers through overlap. The floor (step 9) is the only safety net.

---

## Map Mode: Fertility

Add a **Fertility** map mode alongside the existing terrain/climate modes.

- Each hex is filled with a colour interpolated along the gradient **brown (0) → yellow (5) → green (10+)**. Fertility values above 10 continue to display as the maximum green.
- Map mode available in the existing map-mode selector dropdown.
- On the hex inspector, regardless of active map mode, both `baseFertility` and `currentFertility` are displayed. If they differ, display both values (e.g. `Fertility: 8 (base: 11)`).

---

## Out of Scope

- Population or food production driven by fertility (downstream PRD)
- `currentFertility` changes from gameplay events (war, drought, irrigation)
- Seasonal fertility variation
- Fertility effect on economy or military stats
