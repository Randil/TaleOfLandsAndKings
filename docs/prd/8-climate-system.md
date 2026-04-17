# PRD 8: Climate System

## Overview

Assign each hex a `climate` value (1–10) during world generation, where 1 is extremely cold and 10 is extremely hot. Climate is computed in a layered pipeline applied after terrain generation. A dedicated map mode visualises climate as a blue-to-red colour gradient.

---

## Data Model

Add `climate: number` (integer, 1–10) to the hex type alongside existing terrain fields.

---

## Generation Pipeline

Steps execute in order. After all steps, clamp every hex's climate to `[1, 10]`.

### Step 1 — Belt Assignment (base climate)

Divide the map into 10 horizontal belts numbered 1–10 top to bottom.

- `beltHeight = Math.floor(totalRows / 10)`
- Belt 6 absorbs any remainder: its height is `beltHeight + (totalRows % 10)`
- Every hex receives `climate = beltNumber` as its initial value

### Step 2 — Sea Moderation

Apply to sea tiles only:

| Belts | Delta |
|-------|-------|
| 1–3   | +1 (warmer — seas moderate cold extremes) |
| 4–7   | 0   |
| 8–10  | −1 (cooler — seas moderate heat extremes) |

Then propagate the same modifier to land hexes within 2 hex-steps of any sea tile (coastal ring and one ring further inland). Modifier direction is always *toward moderate (belts 5-6)*: if `climate < 5` apply +1; if `climate > 6` apply −1; if `climate == 5 or climate == 6 ` do nothing.

### Step 3 — Elevation Effect

Apply after sea moderation, before extreme fields:

| Terrain   | Delta |
|-----------|-------|
| Hills     | −1    |
| Mountains | −2    |

Direction is always toward cold (no clamping yet — applied before final clamp).

### Step 4 — Extreme Climate Fields

Fields are grown using the same random-neighbour flood-fill used for continent generation (pick a seed tile, repeatedly add a random neighbour). Target size for each field: **3–8% of total hex count** (pick a random value in that range per field).

Fields start within their designated belt range but may grow outside it.

#### Belts 1–2
| Field | Seed | Delta |
|-------|------|-------|
| Warm zone | Random **sea** tile in belts 1–2 | +1 |
| Cold zone | Random **land** tile in belts 1–2 | −1 |

#### Belts 4–7
| Field | Seed | Delta |
|-------|------|-------|
| Hot zone 1 | Any random tile in belts 4–7 | +1 |
| Hot zone 2 | Any random tile in belts 4–7 | +1 |
| Cold zone 1 | Any random tile in belts 4–7 | −1 |
| Cold zone 2 | Any random tile in belts 4–7 | −1 |

#### Belts 9–10
| Field | Seed | Delta |
|-------|------|-------|
| Hot zone | Random **land** tile in belts 9–10 | +1 |
| Cold zone | Random **sea** tile in belts 9–10 | −1 |

### Step 5 — Clamp

Clamp all hex climate values to `[1, 10]`.

---

## Stacking

All modifiers stack additively. There is no priority ordering between sea effect, elevation effect, and extreme climate fields. The final clamp is the only safety net.

---

## Map Mode: Climate

Add a **Climate** map mode alongside the existing terrain/river modes.

- Each hex is filled with a colour interpolated from **blue (1) → green (5–6) → red (10)** based on its `climate` value.
- Mapmode available in the existing map-mode selector dropdown (WorldGenPanel or equivalent).
- On the hex inspector, regardess of a mapmode, climate value of the hex is displayed

---

## Out of Scope

- Wind patterns
- Precipitation / humidity
- Seasonal variation
- Climate effect on economy or military stats (downstream PRD)
- Mountain elevation as a continuous variable (currently Hills/Mountains are discrete terrain types)
