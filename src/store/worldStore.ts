import { create } from "zustand";
import type { World } from "../types/world";

interface WorldStore {
  world: World | null;
  phase: "generation" | "playing";
  logEntries: string[];
  setWorld: (world: World) => void;
  clearWorld: () => void;
  appendLog: (msg: string) => void;
  clearLog: () => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  phase: "generation",
  logEntries: [],
  setWorld: (world) => set({ world, phase: "playing" }),
  clearWorld: () => set({ world: null, phase: "generation" }),
  appendLog: (msg) => set((s) => ({ logEntries: [...s.logEntries, msg] })),
  clearLog: () => set({ logEntries: [] }),
}));
