import { create } from "zustand";

interface UiStore {
  hoveredHexKey: string | null;
  setHoveredHexKey: (key: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  hoveredHexKey: null,
  setHoveredHexKey: (key) => set({ hoveredHexKey: key }),
}));
