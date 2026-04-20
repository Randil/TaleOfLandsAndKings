# PRD 13: Goods and Resources

## Overview

Introduce a structured catalogue of **Resources** (raw materials extractable from the world) and **Goods** (manufactured items crafted from resources). This PRD defines the data model, catalogue, and world-generation placement logic. Trade and economy mechanics are out of scope and deferred to later PRDs.

Basic subsistence materials (staple grain, common timber, fresh water) are explicitly excluded; this system covers only strategically meaningful materials.

### Placement and Scoping Rules

- Each hex produces **at most one resource**. Resources are tied to both hexes and regions.
- Goods are tied to **regions only** (not individual hexes).
- Hexes in impassable regions (wastelands, ocean) never receive resources.
- Only resources with `naturalSpawn: true` are placed during world generation. Resources with `naturalSpawn: false` require a building to be present.

---

## Data Model

### Terrain Types

```ts
export type ResourceTerrain = "plains" | "hills" | "mountains" | "lake" | "coast" | "city";
```

`"coast"` is treated as a sea zone — coastal hexes and shallow ocean borders. `"lake"` covers inland lake hexes. `"city"` enables all mineral and arcane resources to also spawn in city (megacity) hexes.

### Climate Scale

Climate is a numeric scale from 1 (arctic) to 10 (equatorial). Resources define a `[min, max]` range of valid climates.

```ts
export type ClimateRange = [min: number, max: number]; // inclusive, 1–10
```

### `Resource`

```ts
export interface Resource {
  id: string;
  name: string;
  category: ResourceCategory;
  value: number;                    // 1–10
  rarity: Rarity;
  naturalSpawn: boolean;            // can appear on a hex without a building
  buildingSources: string[];        // building ids that can also produce this
  terrains: ResourceTerrain[];      // empty = any terrain
  climate: ClimateRange;            // empty = any climate (represented as [1, 10])
}
```

### `Good`

```ts
export interface Good {
  id: string;
  name: string;
  category: GoodCategory;
  value: number;                    // 1–10
  rarity: Rarity;
  recipe: Recipe | null;            // null = naturally spawned, not crafted
  naturalSpawn: boolean;
}

export interface Recipe {
  variants: RecipeVariant[];   // any one variant satisfies the recipe
  buildingRequired: string;
}

export interface RecipeVariant {
  inputs: RecipeInput[];
}

export interface RecipeInput {
  type: "resource" | "good";
  id: string;
  quantity: number;
}
```

### Shared Enums

```ts
export type Rarity = "common" | "uncommon" | "rare";

export type ResourceCategory = "mineral" | "organic" | "animal" | "arcane";

export type GoodCategory =
  | "military"
  | "tools"
  | "craft_material"
  | "luxury"
  | "provisions"
  | "alchemical"
  | "arcane";
```

### World Type Extensions

`Hex` gains one optional field set during world generation:

```ts
resourceId?: string; // catalogue id of the resource on this hex, if any
```

`Region` gains two optional fields initialised during world generation:

```ts
resourceIds?: string[]; // unique resource ids present in this region's hexes
goodIds?: string[];     // producible good ids (populated in future phases)
```

---

## Resource Placement Algorithm

Executed by `ResourceGenerator` after region generation, as part of `generateWorld`.

### Pool Construction

1. Count all non-impassable regions → `passableCount`.
2. `totalPool = ceil(passableCount × 1.5)`.
3. Seed pool with **one copy of every naturally-spawning resource** (`naturalSpawn: true`).
4. Compute `extras = max(0, totalPool − pool.length)` and fill using a **1 : 3 : 5** ratio (rare : uncommon : common), picking randomly within each rarity tier.

### Spawning Phases

**Phase 1 — Megacity regions** (regions with `regionType === "city"`): each receives one arcane resource drawn from the pool, placed on a matching hex.

**Phase 2 — Coverage pass**: iterate all passable regions in shuffled order. Any region without a resource yet is assigned one from the pool. If no pool entry matches the region's hexes (terrain + climate), fall back to spawning any applicable common resource outside the pool.

**Phase 3 — Distribution pass**: while the pool is non-empty, shuffle all passable regions and attempt to assign one resource per region per pass. Stops when the pool is empty or no placement succeeds in a full pass.

### Hex Matching

A resource may be placed on a hex only when all of the following hold:

- `hex.terrain` is listed in `resource.terrains`
- `hex.climate` is within `resource.climate` range (inclusive)
- The hex has no existing `resourceId`

Hexes within the region are tried in a shuffled order to ensure even distribution.

---

## Resource Catalogue

### Mineral

| id | Name | Value | Rarity | Terrain | Climate | Natural | Building Source |
|----|------|-------|--------|---------|---------|---------|-----------------|
| `iron` | Iron | 4 | common | hills, mountains, city | 1–10 | yes | Iron Mine |
| `coal` | Coal | 3 | common | hills, mountains, city | 1–10 | yes | Charcoal Pit |
| `precious_metals` | Precious Metals | 8 | uncommon | mountains, city | 1–10 | yes | Gold/Silver Mine |
| `salt` | Salt | 4 | common | coast, plains, city | 1–10 | yes | Salt Works |
| `gems` | Gems | 9 | rare | mountains, city | 1–10 | yes | Gem Mine |
| `marble` | Marble | 5 | uncommon | hills, mountains, city | 3–9 | yes | Quarry |

### Organic

| id | Name | Value | Rarity | Terrain | Climate | Natural | Building Source |
|----|------|-------|--------|---------|---------|---------|-----------------|
| `quality_timber` | Quality Timber | 3 | common | plains, hills | 2–7 | yes | Lumber Camp |
| `dyes` | Dyes | 5 | uncommon | plains, coast | 5–10 | yes | Dye Plantation |
| `spices` | Spices | 7 | rare | plains | 7–10 | yes | Spice Garden |
| `sugar` | Sugar | 5 | uncommon | plains | 6–10 | yes | Sugar Plantation |
| `silk` | Raw Silk | 7 | rare | plains | 4–8 | no | Silk Farm |
| `rare_herbs` | Rare Herbs | 5 | uncommon | hills, mountains | 1–10 | yes | Herb Garden |
| `wine` | Wine | 5 | uncommon | plains, hills | 4–9 | no | Winery |

### Animal

| id | Name | Value | Rarity | Terrain | Climate | Natural | Building Source |
|----|------|-------|--------|---------|---------|---------|-----------------|
| `furs` | Furs | 5 | uncommon | plains, hills | 1–4 | yes | Trapper Lodge |
| `ivory` | Ivory | 7 | rare | plains | 6–10 | yes | — |
| `whale_oil` | Whale Oil | 5 | uncommon | coast | 1–5 | yes | Whaling Station |
| `pearls` | Pearls | 7 | rare | coast | 5–10 | yes | Pearl Fishery |
| `honey` | Honey | 4 | common | plains, hills | 3–8 | yes | Apiary |
| `horses` | Horses | 6 | uncommon | plains | 2–8 | yes | Horse Ranch |
| `wild_beasts` | Wild Beasts | 5 | uncommon | plains, hills, mountains | 2–9 | yes | — |

### Arcane

| id | Name | Value | Rarity | Terrain | Climate | Natural | Building Source |
|----|------|-------|--------|---------|---------|---------|-----------------|
| `dragonbone` | Dragonbone | 10 | rare | mountains, city | 1–10 | yes | — |
| `mithril` | Mithril | 9 | rare | mountains, city | 1–10 | yes | Mithril Mine |
| `ironwood` | Ironwood | 5 | uncommon | plains, hills, city | 3–7 | yes | — |
| `glowstone` | Glowstone | 6 | uncommon | hills, mountains, city | 1–10 | yes | Glowstone Mine |
| `mana_crystal` | Mana Crystal | 9 | rare | mountains, city | 1–10 | yes | Crystal Excavation |
| `relics` | Relics | 10 | rare | plains, hills, mountains, coast, city | 1–10 | yes | — |

---

## Goods Catalogue

| id | Name | Category | Value | Rarity | Inputs | Building |
|----|------|----------|-------|--------|--------|---------|
| `weaponry` | Weaponry | military | 5 | common | (iron × 2 + coal × 1) \| (ironwood × 2) | Smithy |
| `magic_weaponry` | Magic Weaponry | military | 10 | rare | ((dragonbone \| mithril) × 1 + mana_crystal × 1) \| (relics × 1) | Enchanter's Forge |
| `tools` | Tools | tools | 4 | common | (iron × 1 + coal × 1) \| (ironwood × 1) | Smithy |
| `glass` | Glass | craft_material | 4 | common | — | Glassworks |
| `paper` | Paper | craft_material | 4 | common | — | Paper Mill |
| `cloth` | Cloth | craft_material | 4 | common | — | Weaving Mill |
| `fine_cloth` | Fine Cloth | luxury | 7 | uncommon | silk × 2 | Weaving Mill |
| `jewellery` | Jewellery | luxury | 9 | rare | (gems \| precious_metals) × 1 | Jeweller |
| `perfume` | Perfume | luxury | 7 | uncommon | (rare_herbs \| spices) × 1 | Apothecary |
| `exotic_tapestry` | Exotic Tapestry | luxury | 7 | uncommon | dyes × 1 | Artisan Workshop |
| `spirits` | Spirits | provisions | 5 | uncommon | sugar × 1 | Distillery |
| `potions` | Potions | alchemical | 7 | uncommon | rare_herbs × 1, glass × 1 | Alchemist Lab |
| `provisions` | Provisions | provisions | 3 | common | salt × 1 | Smokehouse |
| `artificery` | Artificery | tools | 8 | uncommon | (tools × 1 + glass × 1 + glowstone × 1) \| (relics × 1) | Artificer Workshop |
| `magical_items` | Magical Items | arcane | 9 | rare | (mana_crystal × 1 + paper × 1) \| (relics × 1) | Arcane Foundry |

---

## Resources Map Mode

A dedicated **Resources** map mode is available in the world inspector:

- Hexes with a resource are filled with a **category colour**:
  - Mineral — amber (`#c2872a`)
  - Organic — green (`#3a9e4a`)
  - Animal — gold (`#c8a020`)
  - Arcane — purple (`#8a2be2`)
- Hexes without a resource display their normal terrain colour.
- **Hovering** a resource hex shows a tooltip with the resource name.
- **Hex inspector** displays resource name, category, rarity, and value when a resource hex is hovered.
- **Region inspector** lists the unique resource names present in the hovered region.

---

## Notes

- `value` (1–10) reflects economic and strategic worth; used by trade and income systems.
- `rarity` affects spawn frequency and market availability; it does not restrict crafting.
- Climate range `[1, 10]` means no restriction. A range of `[1, 4]` means cold climates only.
- `naturalSpawn: false` resources (`silk`, `wine`) only appear when the appropriate building is constructed; they are excluded from world-generation placement.
- Arcane resources may have additional discovery or unlock conditions defined in future PRDs.
- Buildings named in recipes are placeholders — building definitions are out of scope for this PRD.
