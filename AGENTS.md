# Arcade Battleship

Retro 80s neon-arcade Battleship vs. AI. Vite + TypeScript + Canvas 2D + Web Audio. Zero runtime dependencies.

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run typecheck` — `tsc --noEmit` (strict)
- `npm test` — Vitest, runs `tests/**/*.test.ts`
- `npm run build` — typecheck + production bundle in `dist/`
- `npm run ai:bench` — simulate each AI tier on random boards and print average shots-to-win (Node runs `.ts` natively)

## Layout

- `src/core` — pure game logic, no DOM (rules, board, game state machine, scoring, AI). Everything here is unit-tested.
- `src/render` — canvas rendering, pixel-art sprite generation, effects/animation system.
- `src/audio` — Web Audio synth, SFX, chiptune sequencer. No audio files.
- `src/ui` — DOM screens (title, difficulty, placement, battle, game over, high scores).
- `tests` — Vitest specs for `src/core`.

## Conventions

- Imports use explicit `.ts` extensions (`allowImportingTsExtensions`) so Node can run scripts directly.
- `erasableSyntaxOnly` is on: no `enum`, no parameter properties, no namespaces. Use `as const` objects + union types.
- AI strategies only receive a `ShotView` (never the opponent `Board`) so they cannot cheat.
- Randomness in `src/core` goes through the injected `Rng` (`src/core/rng.ts`) for deterministic tests.
