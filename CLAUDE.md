# Project: Medieval Fantasy Grand Strategy Game

## Concept
A narrative grand strategy game where the player is a king issuing 
natural language orders. An LLM narrator interprets the orders, 
rolls dice to determine outcomes, and updates the world state. 
No direct unit control — the player governs, the LLM simulates.

## Tech Stack
- React + TypeScript + Vite
- LLM integration via API (provider TBD — abstract behind a service layer)
- No backend for now — all state is client-side

## Architecture
- `src/components/` — UI components (map, chat, panels)
- `src/game/` — game state, world model, rules engine
- `src/narrator/` — LLM integration, prompt templates, dice resolver
- `src/types/` — shared TypeScript interfaces

## Core Data Model (draft)
- **World**: collection of Regions
- **Region**: hex-cluster with owner, terrain, resources, armies
- **Kingdom**: player or AI faction with economy/military/diplomacy stats
- **Turn**: player order (string) → narrator interpretation → dice roll 
  → state delta → narrative response
- **GameState**: full snapshot of world at any point in time

## Key Systems (priority order)
1. World map — hex grid divided into named regions, rendered in React
2. Game state — TypeScript types and state management (Zustand preferred)
3. Narrator service — abstracted LLM call that takes order + game state, 
   returns narrative text + state delta
4. Turn resolution — dice logic, outcome ranges, applying state deltas
5. Economy / military / diplomacy stats per kingdom

## Workflow
- Always ask for approval before making any code changes. Describe what you plan to change and wait for explicit confirmation before editing any files.

## Coding Conventions
- Functional components only, no class components
- Game logic must be pure functions — no side effects outside narrator/
- Narrator is always called through `src/narrator/narratorService.ts`
- All game state goes through a single store — never local component state
  for game data
- Keep components dumb — logic lives in game/ and narrator/

## Current Phase
Phase 1: Static world map with placeholder regions. 
No LLM yet. Focus on rendering the hex grid and defining core types.

## Sandbox Goals
- No win condition — endless play
- Player is king of one starting kingdom
- AI kingdoms act each turn based on simple rules (expand, trade, war)
- Economy, military, diplomacy are the three tracked dimensions per kingdom