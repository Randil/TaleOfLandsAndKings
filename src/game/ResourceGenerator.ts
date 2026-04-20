import type { WorldConfig, Hex, Region } from "../types/world";
import type { Resource } from "../types/resources";
import { RESOURCES, RESOURCE_BY_ID } from "./resources";
import type { RNG } from "./rng";
import { rngPick, rngShuffle } from "./rng";

export class ResourceGenerator {
  private readonly eligible: Resource[];
  private readonly commons: Resource[];
  private readonly uncommons: Resource[];
  private readonly rares: Resource[];

  constructor(
    _config: WorldConfig,
    private readonly hexes: Record<string, Hex>,
    private readonly regions: Record<string, Region>,
    private readonly rng: RNG,
    private readonly onLog?: (msg: string) => void,
  ) {
    this.eligible = RESOURCES.filter((r) => r.naturalSpawn);
    this.commons   = this.eligible.filter((r) => r.rarity === "common");
    this.uncommons = this.eligible.filter((r) => r.rarity === "uncommon");
    this.rares     = this.eligible.filter((r) => r.rarity === "rare");
  }

  generate(): void {
    // Initialise resource tracking on all regions
    for (const region of Object.values(this.regions)) {
      region.resourceIds = [];
      region.goodIds = [];
    }

    const passableRegions = Object.values(this.regions).filter((r) => !r.isImpassable);
    const megacityRegions = passableRegions.filter((r) => r.regionType === "city");
    const totalPool = Math.ceil(passableRegions.length * 1.5);

    this.onLog?.(`ResourceGenerator: ${passableRegions.length} passable regions, pool target = ${totalPool}`);

    // Build pool: fixed seed (5× common, 3× uncommon, 1× rare), scaled to totalPool
    const seedCounts = new Map<string, number>();
    for (const r of this.commons)   seedCounts.set(r.id, 5);
    for (const r of this.uncommons) seedCounts.set(r.id, 3);
    for (const r of this.rares)     seedCounts.set(r.id, 1);

    const initialSeed = [...seedCounts.values()].reduce((a, b) => a + b, 0);
    const ratio = totalPool / initialSeed;

    const pool: string[] = [];
    let roundUp = false;
    for (const [id, count] of seedCounts) {
      const scaled = count * ratio;
      const final = roundUp ? Math.ceil(scaled) : Math.floor(scaled);
      roundUp = !roundUp;
      for (let i = 0; i < final; i++) pool.push(id);
    }

    this.onLog?.(
      `ResourceGenerator: seed=${initialSeed}, ratio=${ratio.toFixed(2)}, pool=${pool.length} (target=${totalPool})`,
    );

    const assignedHexKeys = new Set<string>();

    // Phase 1: megacity regions each receive one arcane resource
    for (const region of megacityRegions) {
      const arcaneIds = pool.filter((id) => RESOURCE_BY_ID[id]?.category === "arcane");
      if (arcaneIds.length === 0) continue;
      const resourceId = rngPick(this.rng, arcaneIds);
      const hex = this.findMatchingHex(region, RESOURCE_BY_ID[resourceId], assignedHexKeys);
      if (hex) {
        this.placeResource(hex, resourceId, region, assignedHexKeys);
        pool.splice(pool.indexOf(resourceId), 1);
      }
    }

    // Phase 2: ensure every passable region has at least one resource
    for (const region of rngShuffle(this.rng, passableRegions)) {
      if ((region.resourceIds?.length ?? 0) > 0) continue;
      this.assignFromPoolOrFallback(region, pool, assignedHexKeys);
    }

    // Phase 3: distribute remaining pool, one per region per pass, until pool is empty
    while (pool.length > 0) {
      let placed = false;
      for (const region of rngShuffle(this.rng, passableRegions)) {
        if (pool.length === 0) break;
        if (this.assignFromPool(region, pool, assignedHexKeys)) placed = true;
      }
      if (!placed) break;
    }

    const placedHexes = Object.values(this.hexes).filter((h) => h.resourceId);
    const totalPlaced = placedHexes.length;
    const countByResource = new Map<string, number>();
    for (const h of placedHexes) {
      countByResource.set(h.resourceId!, (countByResource.get(h.resourceId!) ?? 0) + 1);
    }
    const breakdown = [...countByResource.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id}×${n}`)
      .join(", ");
    this.onLog?.(`ResourceGenerator: done — ${totalPlaced} resources placed (${breakdown})`);
  }

  private assignFromPoolOrFallback(
    region: Region,
    pool: string[],
    assignedHexKeys: Set<string>,
  ): void {
    if (this.assignFromPool(region, pool, assignedHexKeys)) return;

    // Fallback: spawn any applicable common resource outside the pool
    for (const res of rngShuffle(this.rng, this.commons)) {
      const hex = this.findMatchingHex(region, res, assignedHexKeys);
      if (hex) {
        this.placeResource(hex, res.id, region, assignedHexKeys);
        return;
      }
    }
  }

  private assignFromPool(
    region: Region,
    pool: string[],
    assignedHexKeys: Set<string>,
  ): boolean {
    for (const resourceId of rngShuffle(this.rng, pool)) {
      if (region.resourceIds?.includes(resourceId)) continue;
      const res = RESOURCE_BY_ID[resourceId];
      if (!res) continue;
      const hex = this.findMatchingHex(region, res, assignedHexKeys);
      if (hex) {
        this.placeResource(hex, resourceId, region, assignedHexKeys);
        const idx = pool.indexOf(resourceId);
        if (idx !== -1) pool.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  private findMatchingHex(
    region: Region,
    res: Resource,
    assignedHexKeys: Set<string>,
  ): Hex | null {
    const terrainSet = new Set<string>(res.terrains);
    const [climMin, climMax] = res.climate;
    for (const hk of rngShuffle(this.rng, region.hexIds)) {
      if (assignedHexKeys.has(hk)) continue;
      const hex = this.hexes[hk];
      if (!hex) continue;
      if (!terrainSet.has(hex.terrain)) continue;
      const clim = hex.climate ?? 5;
      if (clim < climMin || clim > climMax) continue;
      return hex;
    }
    return null;
  }

  private placeResource(
    hex: Hex,
    resourceId: string,
    region: Region,
    assignedHexKeys: Set<string>,
  ): void {
    const hk = `${hex.q},${hex.r}`;
    hex.resourceId = resourceId;
    assignedHexKeys.add(hk);
    if (!region.resourceIds!.includes(resourceId)) {
      region.resourceIds!.push(resourceId);
    }
  }
}
