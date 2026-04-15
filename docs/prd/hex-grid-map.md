# PRD: Hex Grid & Map Generation

## Overview
Render a large hex grid world map divided into provinces (regions). Each region is a substantial land area — roughly 200 hexes — with its own terrain character, and will eventually hold rivers, cities, and villages. This phase focuses on world generation, rendering, and persistence (save/load). No LLM or turn logic yet.

## Goals
- Display a large hex grid map with province-scale regions (~200 hexes each)
- Define the core TypeScript types for the world map
- Parameterize world generation (seed + number of regions)
- Build a UI panel to generate, save, and load worlds
- Enable full serialization/deserialization of world state to/from JSON files

## Out of Scope (Phase 1)
- LLM integration
- Turn resolution or game logic
- Economy / military / diplomacy stats
- AI kingdoms acting
- Rivers, cities, villages (data stubs only — reserved fields in types)
- Animations or transitions
- Interactivity on the map (hover, selection, tooltips)

---

## Data Model

### Hex
```ts
interface Hex {
  q: number;        // axial coordinate
  r: number;        // axial coordinate
  regionId: string;
  terrain: Terrain; // per-hex terrain for variety within a region
}
```

### Terrain
```ts
type Terrain = 'plains' | 'forest' | 'mountains' | 'hills' | 'desert' | 'coast' | 'water';
```

### Region
```ts
interface Region {
  id: string;
  name: string;
  dominantTerrain: Terrain;   // character of the province
  ownerId: string | null;     // kingdom id, null = unclaimed
  hexIds: string[];           // references to Hex by `${q},${r}`
  // Reserved for future phases:
  rivers: never[];            // placeholder
  cities: never[];            // placeholder
  villages: never[];          // placeholder
}
```

### WorldConfig
```ts
interface WorldConfig {
  seed: number;
  numRegions: number;   // controls map size — total hexes ≈ numRegions * 200
}
```

### World
```ts
interface World {
  config: WorldConfig;          // generation params — needed for reproducibility
  hexes: Record<string, Hex>;   // keyed by `${q},${r}`
  regions: Record<string, Region>;
}
```

All types go in `src/types/world.ts`.

---

## Map Generation

Generation is a pure function — no side effects, fully deterministic given the same config.

```ts
// src/game/mapGen.ts
function generateWorld(config: WorldConfig): World
```

### Generation Steps
1. **Grid sizing** — compute grid radius so total hexes ≈ `numRegions * 200`. For N regions, radius ≈ `ceil(sqrt(N * 200 / π))`.
2. **Region seeds** — pick N evenly distributed seed hexes using the seeded RNG (avoid clustering).
3. **Voronoi partition** — assign every hex to its nearest seed hex (axial distance). Produces N contiguous regions.
4. **Terrain assignment** — each region gets a `dominantTerrain`. Hexes within the region get terrain sampled around the dominant type with noise (e.g. a forest province has mostly forest but some hills/plains at edges).
5. **Water borders** — hexes at the outer edge of the grid are marked `water` and belong to a reserved `water` region (not owned, not playable).
6. **Naming** — assign each region a unique name from a static fantasy name list (`src/game/regionNames.ts`).
7. **Return** full `World` object.

### Constraints
- Minimum region size: 100 hexes (re-roll seed placement if violated)
- Target region size: ~200 hexes
- Water hexes cannot be owned
- Deterministic: same `config` → identical `World`
- RNG: seeded via a simple LCG or `seedrandom` library — no `Math.random()`

---

## Rendering

### Component Tree
```
<App>
  <WorldGenPanel />    // sidebar: seed input, numRegions, generate/save/load buttons
  <GameMap>
    <HexGrid world={world} />
  </GameMap>
</App>
```

### HexGrid
- SVG-based, one `<polygon>` per hex
- Flat-top hex orientation
- Hex pixel size: `HEX_SIZE = 12` (small — map is large, needs to fit viewport)
- Pan via mouse drag; zoom via scroll wheel (basic transform on the SVG `<g>`)
- Region borders: thicker stroke (`strokeWidth=2`, contrasting color) on hex edges shared between different regions

### HexCell (inline in HexGrid or extracted)
- Fill: terrain color
- Stroke: thin for intra-region edges, thick for region borders

### Color Palette (terrain)
| Terrain     | Fill color  |
|-------------|-------------|
| plains      | `#c8d98a`   |
| forest      | `#4a7c59`   |
| mountains   | `#7a6a5a`   |
| hills       | `#a89070`   |
| desert      | `#e3c98a`   |
| coast       | `#a8c8e0`   |
| water       | `#3a6ea8`   |

---

## World Gen Panel (UI)

A sidebar or top bar with the following controls:

| Control            | Type          | Notes                                      |
|--------------------|---------------|--------------------------------------------|
| Seed               | Number input  | Default: random on first load              |
| Number of Regions  | Number input  | Min: 2, Max: 50, Default: 12               |
| Generate           | Button        | Calls `generateWorld({ seed, numRegions })`, replaces current world in store |
| Save to File       | Button        | Serializes world to JSON, triggers browser download as `world-<seed>.json` |
| Load from File     | File input    | Reads JSON file, deserializes, loads into store |

### Serialization
- Format: plain JSON — `World` object is directly serializable (no circular refs, no functions)
- Save: `JSON.stringify(world, null, 2)` → Blob → download link
- Load: `JSON.parse(text)` → validate shape → load into store
- Validation on load: check required top-level fields (`config`, `hexes`, `regions`); show error message if malformed

---

## State Management

World state lives in Zustand store (`src/store/worldStore.ts`):

```ts
interface WorldStore {
  world: World | null;
  setWorld: (world: World) => void;
  clearWorld: () => void;
}
```

`WorldGenPanel` reads/writes this store. `GameMap` reads from it.

---

## File Structure
```
src/
  types/
    world.ts              # Hex, Region, Terrain, World, WorldConfig interfaces
  game/
    mapGen.ts             # generateWorld(config): World — pure function
    hexMath.ts            # axial ↔ pixel, neighbor lookup, distance
    regionNames.ts        # static list of fantasy province names
    rng.ts                # seeded RNG utility
  store/
    worldStore.ts         # Zustand store for world state
  components/
    WorldGenPanel.tsx     # sidebar UI: seed, numRegions, generate/save/load
    GameMap.tsx           # reads world from store, renders HexGrid
    HexGrid.tsx           # SVG canvas, pan/zoom, renders all hexes
```

---

## Acceptance Criteria
- [ ] `generateWorld({ seed, numRegions })` returns a valid `World`
- [ ] Same seed + numRegions always produces the same map
- [ ] All regions have ≥ 100 hexes
- [ ] Map renders in the browser with no errors for numRegions up to 50
- [ ] Regions are visually distinct (terrain color + thick region borders)
- [ ] Pan and zoom work on the map
- [ ] "Generate" button creates a new world and displays it
- [ ] "Save to File" downloads a valid JSON file
- [ ] "Load from File" reads that JSON and re-renders the same map
- [ ] Load shows an error message if the file is malformed
- [ ] No game logic inside React components
- [ ] All TypeScript types in `src/types/world.ts`
