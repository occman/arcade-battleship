# Arcade Battleship

Retro arcade Battleship vs. AI, naval/radar themed (navy + cyan + amber/orange + signal red; palette in `src/render/palette.ts` and `src/styles/theme.css`). Vite + TypeScript + Canvas 2D + Web Audio. Zero runtime dependencies.

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run typecheck` — `tsc --noEmit` (strict)
- `npm test` — Vitest, runs `tests/**/*.test.ts`
- `npm run build` — typecheck + production bundle in `dist/`
- `npm run ai:bench` — simulate each AI tier on random boards and print average shots-to-win (Node runs `.ts` natively)
- `npm run smoke` — headless Chrome click-through of every screen incl. a full game; needs the dev server running and Google Chrome (override with `CHROME=/path`). Screenshots in `.smoke/`.

## Verification checklist

Run `npm run typecheck && npm test && npm run build`, then `npm run smoke` against a running dev server. In dev builds `window.__game` (current match) and `window.__debug` (audio/music/sfx/settings) are exposed for poking around; they are not present in production builds.

## Layout

- `src/core` — pure game logic, no DOM (rules, board, game state machine, scoring, AI). Everything here is unit-tested.
- `src/render` — canvas rendering, pixel-art sprite generation, effects/animation system.
- `src/audio` — Web Audio synth, SFX, chiptune sequencer. No audio files.
- `src/ui` — DOM screens (title, difficulty, placement, battle, game over, high scores) plus the Report Bug dialog.
- `server/bugReport.ts` — Vite plugin exposing `POST /api/report-bug`; creates a Devin session (v3 API) with `DEVIN_API_KEY` / `DEVIN_ORG_ID` / `DEVIN_REPO` from `.env.local`. Never expose those to the client bundle. The endpoint only accepts same-origin `application/json` POSTs and is dev-server only unless `DEVIN_BUG_REPORT_PREVIEW=1`.
- `tests` — Vitest specs for `src/core` and the bug-report server logic.

## Conventions

- Imports use explicit `.ts` extensions (`allowImportingTsExtensions`) so Node can run scripts directly.
- `erasableSyntaxOnly` is on: no `enum`, no parameter properties, no namespaces. Use `as const` objects + union types.
- AI strategies only receive a `ShotView` (never the opponent `Board`) so they cannot cheat.
- Randomness in `src/core` goes through the injected `Rng` (`src/core/rng.ts`) for deterministic tests.
