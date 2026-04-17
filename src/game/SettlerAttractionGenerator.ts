import type { WorldConfig, Hex } from "../types/world";
import { hexKey, hexNeighbors, hexesInRadius } from "./hexMath";

const INELIGIBLE_TERRAINS = new Set(["coast", "water", "lake"]);
const SEA_TERRAINS = new Set(["coast", "water"]);

// Precomputed ring offsets for radius 1–3 (excluding centre)
const RADIUS3_OFFSETS = hexesInRadius(3).filter(([q, r]) => q !== 0 || r !== 0);

export class SettlerAttractionGenerator {
  constructor(
    private readonly config: WorldConfig,
    private readonly hexes: Record<string, Hex>,
    private readonly allCoords: [number, number][],
    private readonly coordSet: Set<string>,
    private readonly onLog?: (msg: string) => void,
  ) {}

  generate(): void {
    this.onLog?.("SettlerAttraction: computing");

    for (const [q, r] of this.allCoords) {
      const key = hexKey(q, r);
      const hex = this.hexes[key];

      // Step 1 — ineligible tiles
      if (INELIGIBLE_TERRAINS.has(hex.terrain)) {
        hex.baseSettlerAttraction = -100;
        hex.currentSettlerAttraction = -100;
        continue;
      }

      // Step 2 — own fertility seed
      let value = hex.currentFertility ?? 0;

      // Step 3 — neighbourhood fertility average (radius 3, in-bounds only)
      let fertSum = 0;
      let fertCount = 0;
      for (const [dq, dr] of RADIUS3_OFFSETS) {
        const nk = hexKey(q + dq, r + dr);
        if (this.coordSet.has(nk)) {
          fertSum += this.hexes[nk].currentFertility ?? 0;
          fertCount++;
        }
      }
      if (fertCount > 0) {
        value += Math.ceil(fertSum / fertCount);
      }

      // Step 4 — climate modifier
      const climate = hex.climate ?? 6;
      if (climate >= 4 && climate <= 7) value += 1;
      else if (climate === 3 || climate === 9) value -= 1;
      else if (climate === 10) value -= 2;
      else if (climate === 1) value -= 4;

      // Step 5 — mountain penalty
      if (hex.terrain === "mountains") value -= 1;

      // Step 6 — fresh water bonus (+2)
      const hasFreshWater =
        hex.riverSize !== undefined ||
        hexNeighbors(q, r).some(([nq, nr]) => this.hexes[hexKey(nq, nr)]?.terrain === "lake");
      if (hasFreshWater) value += 2;

      // Step 7 — river bonus (+2, stacks with step 6)
      if (hex.riverSize !== undefined) value += 2;

      const neighbors = hexNeighbors(q, r);

      // Step 8 — coastal bonus (+1)
      const isCoastal = neighbors.some(([nq, nr]) => {
        const t = this.hexes[hexKey(nq, nr)]?.terrain;
        return t === "coast" || t === "water";
      });
      if (isCoastal) value += 1;

      // Step 9 — good harbour (+2, stacks with step 8)
      if (isCoastal) {
        const hasGoodHarbour = neighbors.some(([nq, nr]) => {
          const nt = this.hexes[hexKey(nq, nr)]?.terrain;
          if (nt !== "coast" && nt !== "water") return false;
          const seaNeighborCount = hexNeighbors(nq, nr).filter(([nnq, nnr]) => {
            const t = this.hexes[hexKey(nnq, nnr)]?.terrain;
            return t === "coast" || t === "water";
          }).length;
          return seaNeighborCount <= 2;
        });
        if (hasGoodHarbour) value += 2;
      }

      // Step 10 — defensible position (+3)
      const landNeighborCount = neighbors.filter(([nq, nr]) => {
        const t = this.hexes[hexKey(nq, nr)]?.terrain;
        return t !== undefined && !SEA_TERRAINS.has(t);
      }).length;
      const mountainNeighborCount = neighbors.filter(
        ([nq, nr]) => this.hexes[hexKey(nq, nr)]?.terrain === "mountains",
      ).length;
      if (landNeighborCount <= 2 || mountainNeighborCount >= 3) value += 3;

      // Step 11 — clamp
      const clamped = Math.max(-100, Math.min(100, value));
      hex.baseSettlerAttraction = clamped;
      hex.currentSettlerAttraction = clamped;
    }

    this.onLog?.("SettlerAttraction: done");
  }
}
