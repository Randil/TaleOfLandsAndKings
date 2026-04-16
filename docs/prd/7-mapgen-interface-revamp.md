# PRD 7 — Map Generation Interface Revamp

## Goal

Replace the always-visible flat panel with a two-phase UI: a dedicated map-generation screen shown before any world exists, and a minimal in-game sidebar shown once a world is generated. Add a scrollable generation log and a live hex-hover inspector.

---

## Phases

### Phase A — Map Generation (no world loaded yet)

Shown on first load and whenever the player returns to generation.

**Contents (top to bottom):**
- World Generator heading
- All current inputs: seed, width, height, algorithm, land coverage %, mountain density %, min landmass size, hexes per river
- Generate button
- Load from File button + hidden file input
- Load error message (if any)
- Generation Log (see below)

### Phase B — In-Game Sidebar (world exists)

Shown after generation completes or a file is loaded.

**Contents (top to bottom):**
- "Return to Map Generation" button — clicking it clears the world and returns to Phase A
- Save to File button (active only when world exists)
- Generation Log (persists and scrolls; same log instance as Phase A)
- Hex Inspector (see below)

**Save to File** is present in Phase B only; it requires a world to exist so it has no place in Phase A. Load from File moves the user to Phase B once a valid file is parsed.

---

## Generation Log

A scrollable text area sitting at the bottom of the panel in both phases.

- Max visible height: ~200 px; overflow-y: auto
- Auto-scrolls to the bottom when new entries are appended
- Each entry is a single line with a timestamp (elapsed seconds since generation started, e.g. `[0.3s]`)
- Log is cleared at the start of each new Generate run
- Persists across Phase A ↔ Phase B transitions

### Required log entries (mapGen)

Emit these in order during `generateWorld` / landmass and river generators. The log must be passed in or threaded through as a callback so pure game functions do not gain side effects (pass an `onLog: (msg: string) => void` parameter).

| Event | Example message |
|---|---|
| Generation started | `Generating world — seed 42, 80×50` |
| Each large landmass begun | `Large landmass #3 — growing from (12, 7)` |
| Medium landmasses step started | `Starting medium landmasses` |
| Small landmasses step started | `Starting small landmasses` |
| River generation started | `Starting river generation` |
| Each river placed | `River #4 placed — 12 segments, drains to sea` |
| Generation complete | `Done — 3 800 hexes, 17 rivers, 8 regions` |

More entries will be added in future PRDs as new systems are introduced.

---

## Hex Inspector

A fixed section below the generation log, visible only in Phase B.

Shows live data for whichever hex the cursor is currently over on the map. Clears (shows placeholder text "Hover a hex to inspect") when the cursor leaves the map.

**Fields:**

| Label | Value |
|---|---|
| ID | hex key string, e.g. `12,7` |
| Terrain | terrain type, e.g. `mountains` |
| Region | region name if assigned, otherwise `—` |
| River | `None` / `Small` / `Large` / `Very Large` depending on whether any river corner touching this hex carries a size classification |

River size logic:
- A hex is considered "touched by a river" if any `HexCornerKey` in any river's `corners` array resolves to a triplet containing that hex's key.
- Size = `Very Large` if the touching corner index ≥ `veryLargeFromIndex`, `Large` if ≥ `largeFromIndex`, otherwise `Small`.
- If multiple rivers touch the hex, show the largest size.

---

## State & Architecture

- `phase: "generation" | "playing"` lives in `worldStore` (or a new `uiStore`). It is set to `"playing"` when `setWorld` is called with a non-null world, and reset to `"generation"` when the user clicks "Return to Map Generation" (which also calls `setWorld(null)`).
- `logEntries: string[]` lives in the same store, appended via an `appendLog` action. Cleared by a `clearLog` action called at the start of each Generate run.
- Hex hover state (`hoveredHexKey: string | null`) lives in `uiStore` or as local state passed down from `GameMap` via a callback prop.
- `generateWorld` gains an optional `onLog` callback parameter. Internally it calls `onLog` at each milestone. The callback is fire-and-forget — the pure return value is unchanged.

---

## Out of Scope

- Animated or progress-bar generation (generation is synchronous for now)
- Undo / history of generation runs
- Any gameplay controls beyond the map-gen panel
