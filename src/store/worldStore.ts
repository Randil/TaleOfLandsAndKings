import { create } from 'zustand';
import type { World } from '../types/world';

interface WorldStore {
  world: World | null;
  setWorld: (world: World) => void;
  clearWorld: () => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  setWorld: (world) => set({ world }),
  clearWorld: () => set({ world: null }),
}));
