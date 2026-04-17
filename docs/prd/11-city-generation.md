# PRD 11: City Generation

## Overview

Introduce `City` as a first-class world object. Cities are spawned during world generation using settler attraction scores. A new world-config parameter controls density. Cities render as a hut icon on every map mode and show a name tooltip on hover. The hex inspector surfaces all city data when a city hex is hovered.

---

## Refactor: Settler Attraction Split

Rename `settlerAttraction` on `Hex` to `baseSettlerAttraction` (set once, never mutated after generation) and add `currentSettlerAttraction` (mutable during gameplay, initialised to `baseSettlerAttraction` at world-gen time). All existing read sites switch to `currentSettlerAttraction`; the map mode visualisation uses `currentSettlerAttraction`.

```ts
baseSettlerAttraction?: number;   // −100 to 100, set once at world generation
currentSettlerAttraction?: number; // −100 to 100, may change during gameplay
```

---

## Data Model

### City

```ts
export interface City {
  id: string;       // stable unique ID, e.g. "city-0", "city-1"
  hexKey: string;   // the hex this city occupies
  name: string;     // drawn from the name list at generation time
}
```

### World

Add to `World`:

```ts
cities: City[];
```

### WorldConfig

Add to `WorldConfig`:

```ts
hexesPerCity: number; // how many total hexes per city spawned (default 200)
```

---

## Generation Pipeline

Runs as `CityGenerator` immediately after `SettlerAttractionGenerator`. Receives the full `hexes` map and mutates `currentSettlerAttraction` in place during spawning.

### Step 1 — Determine city count

```
cityCount = ceil(totalHexCount / hexesPerCity)
```

### Step 2 — Iterative greedy placement

Repeat until `cityCount` cities have been placed:

1. Find the hex with the highest `currentSettlerAttraction` among all hexes where `currentSettlerAttraction > -100`. If no such hex exists, stop early.
2. Spawn a city on that hex (assign the next name from the list, generate a stable ID).
3. Set `currentSettlerAttraction` of the city hex to `−100`.
4. Apply attraction decay to surrounding hexes (additive, floors at −100):

| Ring | Delta |
|------|-------|
| 1    | −8    |
| 2    | −6    |
| 3    | −4    |
| 4    | −2    |

Only apply decay to hexes that exist within map boundaries. Hexes already at −100 stay at −100.

---

## City Name List

300 procedurally chosen fantasy / medieval city names, stored as a constant array in `src/game/cityNames.ts`. Names are assigned sequentially in order (index 0 for the first city placed, index 1 for the second, etc.). If more cities are needed than names available, append a space and an incrementing integer starting at 2 to the cycling name (e.g. name at index 300 → `"Aldenmoor 2"`, index 301 → `"Brightholm 2"`, etc.).

---

## Rendering

### Hut icon

Draw a small hut glyph centred on each city hex, on top of all terrain/river layers, **on every map mode**.

The hut is drawn in canvas using simple geometry — no image assets:

- **Body**: a small filled rectangle (house walls), white fill, dark outline.
- **Roof**: a filled triangle above the rectangle, same dark outline.
- Scale the icon to approximately 40% of `HEX_SIZE` so it is legible at default zoom without occluding the hex colour.

The icon should remain the same pixel size regardless of zoom level (scale-independent rendering): compute the icon size in screen pixels and apply the inverse scale when drawing so the icon appears constant-size at all zoom levels. If implementing scale-independence is complex, a fixed small world-space size is acceptable for this PRD.

### City name tooltip

When `hoveredHexKey` corresponds to a hex that has a city, display a small floating label near the cursor showing the city name. The label is a React overlay (positioned absolutely over the canvas), not drawn on the canvas itself.

- Position: 12px to the right and 4px above the cursor.
- Style: small white text on a semi-transparent dark background, 1px border-radius, padding 2px 6px, font-size 11px.
- The tooltip disappears when the hex is no longer hovered.

---

## Hex Inspector

When the hovered hex contains a city, add a **City** section to the hex inspector panel below the existing fields:

```
City
  Name     Aldenmoor
```

If no city is present, the section is omitted entirely.

---

## World Gen Panel

Add a **Hexes per city** numeric input to the generation form (alongside the existing hex-count controls). Default value: `200`. Wired to `WorldConfig.hexesPerCity`.

---

## Out of Scope

- City stats (population, economy, military).
- City ownership / faction assignment.
- Player-founded cities.
- Town / village tiers.
- City growth or destruction during gameplay.
- `currentSettlerAttraction` changes from events other than city placement.
