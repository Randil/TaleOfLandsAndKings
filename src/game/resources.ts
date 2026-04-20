import type { Resource } from "../types/resources";

export const RESOURCES: Resource[] = [
  // Mineral
  { id: "iron",            name: "Iron",            category: "mineral", value: 4,  rarity: "common",   naturalSpawn: true,  buildingSources: ["Iron Mine"],         terrains: ["hills", "mountains", "city"],               climate: [1, 10] },
  { id: "coal",            name: "Coal",            category: "mineral", value: 3,  rarity: "common",   naturalSpawn: true,  buildingSources: ["Charcoal Pit"],      terrains: ["hills", "mountains", "city"],               climate: [1, 10] },
  { id: "precious_metals", name: "Precious Metals", category: "mineral", value: 8,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Gold/Silver Mine"],  terrains: ["mountains", "city"],                        climate: [1, 10] },
  { id: "salt",            name: "Salt",            category: "mineral", value: 4,  rarity: "uncommon",   naturalSpawn: true,  buildingSources: ["Salt Works"],        terrains: ["coast", "plains", "city"],                  climate: [1, 10] },
  { id: "gems",            name: "Gems",            category: "mineral", value: 9,  rarity: "rare",     naturalSpawn: true,  buildingSources: ["Gem Mine"],          terrains: ["mountains", "city"],                        climate: [1, 10] },
  { id: "marble",          name: "Marble",          category: "mineral", value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Quarry"],            terrains: ["hills", "mountains", "city"],               climate: [3, 9]  },
  // Organic
  { id: "quality_timber",  name: "Quality Timber",  category: "organic", value: 3,  rarity: "common",   naturalSpawn: true,  buildingSources: ["Lumber Camp"],       terrains: ["plains", "hills"],                          climate: [2, 7]  },
  { id: "dyes",            name: "Dyes",            category: "organic", value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Dye Plantation"],    terrains: ["plains", "coast"],                          climate: [5, 10] },
  { id: "spices",          name: "Spices",          category: "organic", value: 7,  rarity: "uncommon",     naturalSpawn: true,  buildingSources: ["Spice Garden"],      terrains: ["plains"],                                   climate: [7, 10] },
  { id: "sugar",           name: "Sugar",           category: "organic", value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Sugar Plantation"],  terrains: ["plains"],                                   climate: [6, 10] },
  { id: "silk",            name: "Raw Silk",        category: "organic", value: 7,  rarity: "rare",     naturalSpawn: true, buildingSources: ["Silk Farm"],         terrains: ["plains"],                                   climate: [4, 8]  },
  { id: "rare_herbs",      name: "Rare Herbs",      category: "organic", value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Herb Garden"],       terrains: ["hills", "mountains"],                       climate: [1, 10] },
  { id: "wine",            name: "Wine",            category: "organic", value: 5,  rarity: "uncommon", naturalSpawn: true, buildingSources: ["Winery"],            terrains: ["plains", "hills"],                          climate: [4, 9]  },
  // Animal
  { id: "furs",            name: "Furs",            category: "animal",  value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Trapper Lodge"],     terrains: ["plains", "hills"],                          climate: [1, 4]  },
  { id: "ivory",           name: "Ivory",           category: "animal",  value: 7,  rarity: "rare",     naturalSpawn: true,  buildingSources: [],                    terrains: ["plains"],                                   climate: [6, 10] },
  { id: "whale_oil",       name: "Whale Oil",       category: "animal",  value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Whaling Station"],   terrains: ["coast"],                                    climate: [1, 5]  },
  { id: "pearls",          name: "Pearls",          category: "animal",  value: 7,  rarity: "rare",     naturalSpawn: true,  buildingSources: ["Pearl Fishery"],     terrains: ["coast"],                                    climate: [5, 10] },
  { id: "honey",           name: "Honey",           category: "animal",  value: 4,  rarity: "common",   naturalSpawn: true,  buildingSources: ["Apiary"],            terrains: ["plains", "hills"],                          climate: [3, 8]  },
  { id: "horses",          name: "Horses",          category: "animal",  value: 6,  rarity: "common", naturalSpawn: true,  buildingSources: ["Horse Ranch"],       terrains: ["plains"],                                   climate: [2, 8]  },
  { id: "wild_beasts",     name: "Wild Beasts",     category: "animal",  value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: [],                    terrains: ["plains", "hills", "mountains"],             climate: [2, 9]  },
  // Arcane
  { id: "dragonbone",      name: "Dragonbone",      category: "arcane",  value: 10, rarity: "rare",     naturalSpawn: true,  buildingSources: [],                    terrains: ["mountains", "city"],                        climate: [1, 10] },
  { id: "mithril",         name: "Mithril",         category: "arcane",  value: 9,  rarity: "rare",     naturalSpawn: true,  buildingSources: ["Mithril Mine"],      terrains: ["mountains", "city"],                        climate: [1, 10] },
  { id: "ironwood",        name: "Ironwood",        category: "arcane",  value: 5,  rarity: "uncommon", naturalSpawn: true,  buildingSources: [],                    terrains: ["plains", "hills", "city"],                  climate: [3, 7]  },
  { id: "glowstone",       name: "Glowstone",       category: "arcane",  value: 6,  rarity: "uncommon", naturalSpawn: true,  buildingSources: ["Glowstone Mine"],    terrains: ["hills", "mountains", "city"],               climate: [1, 10] },
  { id: "mana_crystal",    name: "Mana Crystal",    category: "arcane",  value: 9,  rarity: "rare",     naturalSpawn: true,  buildingSources: ["Crystal Excavation"],terrains: ["mountains", "city"],                        climate: [1, 10] },
  { id: "relics",          name: "Relics",          category: "arcane",  value: 10, rarity: "rare",     naturalSpawn: true,  buildingSources: [],                    terrains: ["plains", "hills", "mountains", "coast", "city"], climate: [1, 10] },
];

export const RESOURCE_BY_ID: Record<string, Resource> = Object.fromEntries(
  RESOURCES.map((r) => [r.id, r]),
);
