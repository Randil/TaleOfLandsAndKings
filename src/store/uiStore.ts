import { create } from "zustand";

export type MapMode = "terrain" | "rivers" | "climate" | "fertility" | "settler-attraction";

interface UiStore {
  hoveredHexKey: string | null;
  setHoveredHexKey: (key: string | null) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  cursorPos: { x: number; y: number } | null;
  setCursorPos: (pos: { x: number; y: number } | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  hoveredHexKey: null,
  setHoveredHexKey: (key) => set({ hoveredHexKey: key }),
  mapMode: "terrain",
  setMapMode: (mode) => set({ mapMode: mode }),
  cursorPos: null,
  setCursorPos: (pos) => set({ cursorPos: pos }),
}));
