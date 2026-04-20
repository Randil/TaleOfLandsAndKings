export type ResourceTerrain = "plains" | "hills" | "mountains" | "lake" | "coast" | "city";
export type ClimateRange = [min: number, max: number];
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

export interface Resource {
  id: string;
  name: string;
  category: ResourceCategory;
  value: number;
  rarity: Rarity;
  naturalSpawn: boolean;
  buildingSources: string[];
  terrains: ResourceTerrain[];
  climate: ClimateRange;
}

export interface Good {
  id: string;
  name: string;
  category: GoodCategory;
  value: number;
  rarity: Rarity;
  recipe: Recipe | null;
  naturalSpawn: boolean;
}

export interface Recipe {
  variants: RecipeVariant[];
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
