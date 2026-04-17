import { create } from "zustand";

export type MapMode = "terrain" | "rivers" | "climate";

interface UiStore {
  hoveredHexKey: string | null;
  setHoveredHexKey: (key: string | null) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  hoveredHexKey: null,
  setHoveredHexKey: (key) => set({ hoveredHexKey: key }),
  mapMode: "terrain",
  setMapMode: (mode) => set({ mapMode: mode }),
}));
