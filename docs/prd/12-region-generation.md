# PRD 12: Region Generation System

## Overview

Replace the placeholder `land` / `water` regions with a real region generation pass that divides the world into named, geographically coherent regions. Region size is biased by settler attraction — dense, fertile areas produce small regions; remote wastelands and mountain ranges form large impassable land regions. Lake hexes are regular claimable tiles absorbed into adjacent land regions (and split between regions for large lakes). All remaining ocean and coast tiles not claimed by a land region form their own impassable ocean regions, one per connected body. Impassable regions (both land and ocean types) are marked with a diagonal grey stripe overlay on the terrain map mode. Regions are rendered with black borders; the boundary between land and ocean impassable regions uses grey.

---

## Data Model

### WorldConfig additions

```ts
regionGenAlgorithm: RegionGenAlgorithm; // see type below
meanRegionSize: number;                 // target hexes per region; default 15
```

### New type

```ts
export type RegionGenAlgorithm = "weighted-bfs" | "none";
```

`"none"` retains the legacy two-region (land / water) placeholder behaviour.

### Region — `regionType`

Add a type discriminator to `Region`:

```ts
export interface Region {
  id: string;
  name: string;
  regionType: "land" | "city";
  dominantTerrain: Terrain;
  ownerId: string | null;
  hexIds: string[];
  isImpassable: boolean; // true for land-impassable and ocean-impassable regions
  rivers: never[];
  cities: never[];
}
```

`"city"` marks a megacity region (see Step 0). All other regions — including impassable ones — use `"land"`.

### Region — `isImpassable`

### Region — `dominantTerrain`

Set to the terrain type held by the most hexes in the region (mode). Ties broken by first encountered.

---

## Generation Pipeline

`RegionGenerator` runs immediately after `CityGenerator`. It receives the full `hexes` map, mutates `regionId` on each hex in place, and returns `Record<string, Region>` replacing the current hardcoded region map in `mapGen.ts`.

### Step 0 — Skip if algorithm is `"none"`

Emit two placeholder regions (`land`, `water`) exactly as today with `isImpassable: false` and return.

### Step 0.5 — City region seeding

Runs before any other assignment. Requires the `cities` list produced by `CityGenerator`.

1. Build a `hexKey → City` lookup from the city list.
2. Compute `megacityCount = max(1, round(cities.length × 0.05))`.
3. Repeat up to `megacityCount` times:
   a. Find the unassigned city-hex with the **highest `baseSettlerAttraction`**. If none remain, stop early.
   b. That hex becomes the **seed** of a new city region. Assign it.
   c. Scan all 6-neighbours of the seed. For each neighbour that is unassigned **and** hosts a city: assign it to this region and **rename its `City` object to the seed city's name** (it becomes a district).
   d. Let `cityClaimed` = total hexes assigned so far (1 seed + absorbed city neighbours).
   e. BFS outward from the full region boundary, claiming unassigned hexes until `cityClaimed` more hexes have been absorbed (any terrain).
   f. Create the region with `regionType: "city"`, `isImpassable: false`, `name = seed city name`.
4. City regions are **exempt** from `splitOversizedRegions` and `mergeUndersizedRegions`.

Log: `City regions: N megacity regions seeded`.

### Step 1 — Land impassable cluster detection

Scan every hex where:
- `terrain` is not `"water"`, `"coast"`, or `"lake"`, **and**
- `baseSettlerAttraction < 2`

Find connected components of such hexes (6-neighbour adjacency). Each component becomes one **land impassable region**, assigned a stable ID (`"impassable-land-0"`, `"impassable-land-1"`, …), a name from `regionNames.ts`, and `isImpassable: true`. Mark every hex with that `regionId`.

Hexes assigned in this step are excluded from all later steps.

Lakes are **explicitly excluded** from this step — a lake hex with `baseSettlerAttraction < 3` is not treated as impassable here. It will be absorbed into a land region in Step 6.

### Step 2 — Island detection

Find all connected components of remaining unassigned hexes where `terrain` is not `"water"`, `"coast"`, and not yet assigned. **Lake hexes are excluded from island detection** — they are handled in Step 6. Each component is an **island** (or continent). Process each independently in Steps 3–5.

### Step 3 — Seed placement (per island)

For each island:

1. Collect all unassigned land hexes in the island (no lake or coast). Call this set **P** (passable hexes).
2. Compute:
   ```
   seedCount = max(1, round(|P| / meanRegionSize))
   ```
3. Select `seedCount` seed hexes from **P** via weighted random sampling **without replacement**, where each hex's weight is:
   ```
   weight = max(1, baseSettlerAttraction)
   ```
   Hexes with higher attraction are more likely to become seeds, producing smaller, denser regions in fertile areas.

### Step 4 — Budget assignment

Each seed is assigned a **hex budget** controlling how large its region may grow:

```
localAttraction      = max(1, seed.baseSettlerAttraction)
averageIslandAttr    = mean of max(1, baseSettlerAttraction) over all hexes in P
averageMapAttr       = mean of max(1, baseSettlerAttraction) over all land hexes in the entire map
budget = max(1, round(2 × meanRegionSize × (averageIslandAttr / (localAttraction + averageMapAttr))))
```

The global map average (`averageMapAttr`) acts as a damping term: it reduces the variance between budgets on maps where island attraction is unusually high or low relative to the whole map. Doubling the base multiplier (`2 ×`) compensates so median-attraction seeds still receive a budget close to `meanRegionSize`.

High-attraction seeds get small budgets (tight regions); low-attraction seeds get large budgets (sprawling regions).

### Step 5 — BFS growth

Run a multi-source BFS from all seeds simultaneously (FIFO within the same distance band — standard BFS).

Each seed's region claims adjacent unassigned hexes in **P** until its budget is exhausted. A region that exhausts its budget stops expanding but retains already-claimed hexes.

Tie-breaking when two regions reach the same hex simultaneously: assign to the region with the larger remaining budget.

After all seeds are exhausted, any remaining unassigned hexes in **P** are absorbed by the assigned neighbour region with the most hexes (largest wins; region ID lexicographic tiebreak).

### Step 6 — Lake and coast absorption (post-BFS pass)

After BFS growth is complete across all islands, absorb lake and coast hexes into adjacent land regions. The pass has two sub-passes, each iterating until convergence:

**Pass 1 — land-terrain neighbours only**

1. Collect all unassigned hexes where `terrain === "lake"` or (`terrain === "coast"` and at least one 6-neighbour hex has a land terrain).
2. For each such hex, find all assigned neighbours whose own terrain is a land terrain (plains, forest, mountains, hills, desert). If none exist, skip for this iteration.
3. Assign the hex to the neighbour region with the **largest current hex count**. Ties broken by region ID (lexicographic).
4. Repeat until no further assignments are made.

**Pass 2 — isolated lakes**

Lakes left unassigned after Pass 1 (no land-terrain neighbours) may absorb into any assigned region:

1. For each remaining unassigned `lake` hex, find any assigned 6-neighbour.
2. Assign to the neighbour region with the largest hex count (region ID tiebreak).
3. Repeat until no further assignments are made.

This naturally splits a large lake between surrounding land regions. Coast hexes with no land-terrain neighbours at all remain unassigned and proceed to Step 11.

### Step 7 — Split oversized regions

Any non-impassable land region exceeding `4 × meanRegionSize` hexes is split. The split is performed by BFS-halving:

1. Start a BFS from the first hex of the region and claim hexes until half the region's hexes are in part 1.
2. The remaining hexes become a new region (new ID, new name from the land name sequence).
3. Recompute `dominantTerrain` for both parts.
4. Repeat until no region exceeds the threshold.

Log: `Split N oversized regions` (omitted if N = 0).

### Step 8 — Fix isolated regions via wasteland corridors

After splitting, verify all non-impassable land regions form a single connected component (adjacency = shared hex edge). If multiple components exist:

1. Identify the **main component** — the one with the most total hexes.
2. For each isolated component, BFS outward through impassable-land hexes (wasteland) to find the shortest wasteland path to any region already in the main component.
3. Reassign the wasteland hexes along that path to the isolated component's border region, removing them from their wasteland region and updating hex counts.
4. **Expand the corridor region into adjacent wasteland up to its budget.** Compute:
   ```
   localAttr = mean of max(1, baseSettlerAttraction) over the corridor region's current hexes
   budget    = max(1, round(2 × meanRegionSize × (avgMapAttr / (localAttr + avgMapAttr))))
   needed    = max(0, budget − current_hex_count)
   ```
   where `avgMapAttr` is the global land-hex average attraction computed during initial BFS. BFS outward from the corridor region into adjacent wasteland hexes, claiming until `needed` more hexes are absorbed or wasteland is exhausted. Update affected wasteland regions' `hexIds` and counts.
5. After connecting, treat the newly connected component as part of the main component for subsequent isolated components.

If no wasteland path exists for an isolated component, it is left isolated (ocean-separated islands are expected).

Log: `Fixed N isolated region groups via wasteland corridors` (omitted if N = 0).

### Step 9 — Re-run lake and coast absorption

Run the full two-pass absorption from Step 6 again. This picks up any coast or lake hexes that became reachable from land regions after the corridor insertion in Step 8.

Log: `Re-absorption after corridors — N hexes` (omitted if N = 0).

### Step 10 — Merge undersized land regions

Any non-impassable land region with fewer than `meanRegionSize / 2` hexes is merged into its **smallest** non-impassable neighbour:

1. Find all non-impassable neighbour regions (regions sharing at least one hex edge).
2. Merge into the neighbour with the fewest hexes (region ID tiebreak).
3. Recompute `dominantTerrain` for the surviving region.
4. Repeat until no region is undersized.

Log: `Merged N undersized land regions` (omitted if N = 0).

### Step 11 — Ocean impassable regions

Find all connected components of remaining unassigned hexes where `terrain === "water"`, `terrain === "coast"`, or `terrain === "lake"` (6-neighbour adjacency, treating all three terrain types as connectable). Each component becomes one **ocean impassable region**:

- ID: `"impassable-ocean-0"`, `"impassable-ocean-1"`, …
- Name: from `regionNames.ts` (continuing the sequence after land impassable regions)
- `isImpassable: true`

Ocean impassable regions have **no size cap** — an entire connected ocean is one region.

### Step 12 — Region naming

**Land and land-impassable regions** draw names from `REGION_NAMES` in `src/game/regionNames.ts` (300 entries):
1. Land impassable regions (Step 1) — indices 0, 1, 2, …
2. BFS land regions (Steps 3–5) — continuing the index sequence

**Ocean impassable regions** draw names from `OCEAN_REGION_NAMES` in `src/game/oceanRegionNames.ts` (100 entries), starting at index 0 independently of the land name counter.

If either list is exhausted, append a space and an incrementing integer starting at 2 (same convention as PRD 11 city names: e.g. `"Stormwold 2"`, `"Stormbight 2"`).

---

## Rendering Changes

### Impassable stripe overlay

On the **terrain map mode only**, draw a diagonal grey stripe pattern over every hex whose region has `isImpassable: true`. The stripe sits on top of the base terrain colour so the underlying colour remains visible.

Stripe specification:
- **Colour**: `rgba(80, 80, 80, 0.45)` (semi-transparent dark grey)
- **Direction**: 45° diagonal (top-left to bottom-right)
- **Line width**: 1.5 px
- **Spacing**: one stripe every 5 px (screen space)
- Implementation: use a canvas `clip` to the hex polygon, then draw a set of parallel lines across the bounding box

Apply this overlay after the base hex fill and before borders and city icons.

### Region borders

After the terrain fill (and stripe overlay), draw borders between adjacent hexes belonging to **different regions**:

- **Between two non-ocean regions** (land, land-impassable): **solid black**, 1.5 px.
- **Between a non-ocean region and an ocean impassable region**: **grey (`#888888`)**, 1 px. This covers all land-to-sea and coast-to-open-water boundaries.
- **Between two ocean impassable regions**: no border (open ocean bodies don't need a border between them in normal usage; can be revisited).

No border is drawn between hexes of the **same** region.

---

## UI — World Generation Panel

### Region generation algorithm dropdown

Add a **Region Algorithm** dropdown to the generation form, placed immediately after the existing map algorithm dropdown.

Options:

| Label | Value |
|-------|-------|
| Weighted BFS | `weighted-bfs` |
| None | `none` |

Default: `weighted-bfs`.

### Mean region size input

Add a **Mean region size** numeric input (integer, min 10, max 500) placed immediately after the Region Algorithm dropdown. Visible and enabled only when algorithm is `weighted-bfs`. Default: `15`.

---

## Generation Log

Add the following log entries emitted by `RegionGenerator`:

| Event | Example message |
|---|---|
| Region generation started | `Starting region generation — weighted-bfs, mean size 80` |
| City regions seeded | `City regions: 2 megacity regions seeded` |
| Land impassable clusters | `Land impassable clusters: 4 regions` |
| Per-island seeding | `Island #2 — 1 840 hexes, 23 seeds` |
| BFS complete | `BFS complete — 31 land regions` |
| Lake/coast absorption | `Lake & coast absorption — 214 hexes assigned` |
| Split oversized | `Split 2 oversized regions` (omitted if none) |
| Isolated region fix | `Fixed 1 isolated region groups via wasteland corridors` (omitted if none) |
| Re-absorption | `Re-absorption after corridors — 12 hexes` (omitted if none) |
| Merge undersized | `Merged 5 undersized land regions` (omitted if none) |
| Ocean impassable regions | `Ocean impassable regions: 3` |
| Done summary | `Region generation done — 38 total regions` |

---

## Rendering Helper

`RegionGenerator` exposes a static helper used by the renderer to classify regions without inspecting IDs:

```ts
static isOceanImpassable(region: Region): boolean
```

Returns `true` when `region.isImpassable` and `region.dominantTerrain` is `"water"`, `"coast"`, or `"lake"`. Used to distinguish land-impassable from ocean-impassable regions when choosing border colour and stripe treatment.

---

## Out of Scope

- Region ownership / faction assignment.
- Region-level stats (economy, military, diplomacy).
- Player-visible region names on the map.
- Region borders scaling with zoom level (static widths are acceptable).
- Merging small isolated remnant land regions with their neighbours.
- Dynamic region mutation during gameplay.
- Stripe overlay on non-terrain map modes (climate, fertility, settler attraction).
