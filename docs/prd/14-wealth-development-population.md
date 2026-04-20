# PRD 14: Wealth, Development, and Population

## Overview

Introduce three economic parameters to every **Region**: **Development**, **Population** (current and maximum), and **Wealth**. These are seeded during world generation, after resource placement, and form the foundation for future economy and taxation systems.

---

## Data Model

### `Region` extensions

```ts
development: number;        // integer ≥ 1; reflects infrastructure and urbanisation
maxPopulation: number;      // theoretical population ceiling for the region
population: number;         // current population at world-gen time (50–80 % of max)
wealth: number;             // starting economic value of the region
```

---

## Seeding Algorithm

Seeding runs in three sequential phases inside `RegionGenerator` (or a dedicated `EconomyGenerator`), executed after `ResourceGenerator` completes.

### Phase 1 — Development

1. **Base value**: every passable region starts with `development = 1`. Impassable regions keep `development = 0`.
2. **City bonus**: for each city in `world.cities`, look up the region that contains that city's hex and add **+1** to that region's `development`. Multiple cities in the same region stack.
3. **Megacity bonus**: add **+3** to every region whose `regionType === "city"` (megacity regions, as defined in PRD 11).
4. **Capital selection**: count all passable regions that contain at least one entry from `world.cities` → `regionsWithCities`. For every 30 passable regions on the map, select **1 random region** from `regionsWithCities`. For each selected region:
   - Add **+2** to its own `development`.
   - Add **+1** to the `development` of each neighbouring region (regions that share at least one hex edge with the selected region).

> Steps 2 and 3 can both apply to the same region: a megacity region receives +1 per city in it (step 2) + +3 (step 3) before the capital bonus.

---

### Phase 2 — Population

Maximum population capacity is computed per region from hex fertility values:

```
maxPopulation = (Σ fertility(hex)² for all hexes in region) × development × 100
```

Where `fertility(hex)` is `hex.currentFertility` (falls back to `hex.baseFertility`). Hexes with no fertility value contribute 0.

Starting population is sampled uniformly at random between **50 % and 80 %** of `maxPopulation`, rounded to the nearest integer:

```
population = round(maxPopulation × uniform(0.50, 0.80))
```

Impassable regions and ocean regions receive `maxPopulation = 0` and `population = 0`.

---

### Phase 3 — Wealth

Each passable region's starting wealth is the sum of three components:

| Component | Formula |
|---|---|
| Development income | `development × 5` |
| Resource value | `Σ resource.value` for all resources in `region.resourceIds` |
| Food surplus | `fertilitySum × (1 − population / maxPopulation)` |

Where `fertilitySum = Σ currentFertility` for all hexes in the region.

The **food surplus** component represents unused agricultural capacity. If `maxPopulation === 0`, food surplus is 0.

Final wealth is rounded to the nearest integer. Impassable regions receive `wealth = 0`.

---

## Map Modes

### Population map mode

- All hexes belonging to a region are filled with a colour interpolated on a **red → yellow → green** gradient based on that region's `population`.
- The gradient bounds are derived from the live map data:
  - **Red** (minimum) = the lowest `population` value among all passable regions.
  - **Green** (maximum) = the highest `population` value among all passable regions.
- Impassable and ocean region hexes are rendered in a neutral dark colour (outside the gradient).
- **Hex inspector** displays the region's `population`, `maxPopulation`, and the percentage filled (`population / maxPopulation × 100 %`) when a hex is hovered.

### Wealth map mode

- All hexes belonging to a region are filled with a colour interpolated on a **red → yellow → green** gradient based on that region's `wealth`.
- The gradient bounds are derived from the live map data:
  - **Red** (minimum) = the lowest `wealth` value among all passable regions.
  - **Green** (maximum) = the highest `wealth` value among all passable regions.
- Impassable and ocean region hexes are rendered in a neutral dark colour (outside the gradient).
- **Hex inspector** displays the region's `wealth` value when a hex is hovered.

### Gradient interpolation

Both modes use the same linear interpolation formula:

```
t = (value − minValue) / (maxValue − minValue)   // clamped to [0, 1]

red   = lerp(255, 255, t) → lerp(255, 0,   t)   // red channel
green = lerp(0,   255, t) → lerp(0,   200, t)   // green channel
blue  = 0
```

Concretely: at `t = 0` the colour is `#ff0000` (red), at `t = 0.5` it is `#ffff00` (yellow), and at `t = 1` it is `#00c800` (green). If all passable regions share the same value (`maxValue === minValue`), every hex renders at the midpoint yellow.

---

## Notes

- `development` is always a positive integer for passable regions; future PRDs may raise it through buildings, roads, or events.
- `population` and `maxPopulation` are stored as plain numbers (not per-hex) at this stage; a per-hex breakdown is deferred.
- `wealth` at this stage is a static seed value; dynamic wealth accumulation (trade, taxation, upkeep) is out of scope for this PRD.
- The capital-selection step (Phase 1, step 4) uses the world PRNG so results are deterministic given the same seed.
