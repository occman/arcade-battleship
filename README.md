# Arcade Battleship

A retro arcade take on Battleship, played in the browser against an AI with four difficulty tiers. Radar-scope boards over a night ocean, pixel-art fleets, explosions, screen shake, chiptune audio, CRT scanlines and a high-score table with three-letter initials. No runtime dependencies: everything is drawn on `<canvas>` and synthesised with the Web Audio API.

## Play

```sh
npm install
npm run dev        # open http://localhost:5173
```

Pick a rank, deploy your fleet, then click the enemy waters to fire. Sink all five ships before the machine sinks yours.

| Rank | How it plays |
|---|---|
| Cadet | Fires at random. Never follows up a hit. |
| Lieutenant | Hunts randomly, but probes around hits and extends lines of hits. |
| Captain | Probability-density targeting with a little human slack. |
| Admiral | Near-perfect density targeting, exact sunk-ship bookkeeping, and a deliberately hard-to-find fleet. |

The AI only ever sees what you would see on a target grid (hits, misses, which ship classes are sunk). It cannot peek at your board.

### Controls

| Screen | Keys |
|---|---|
| Everywhere | `Enter` confirm, `Esc` back |
| Placement | Click a ship in the dock, click the water to place it; click a deployed ship to move it. `R` / right-click rotate, `1`-`5` select, arrows aim |
| Battle | Click a cell to fire, or arrows + `Enter`. `Esc` abandons ship (with confirmation) |
| Game over | Type initials, `Enter` to confirm |

Music can be switched on/off on every screen (button or `M`). If your OS asks for reduced motion, animations are shortened and flashes disabled automatically. Settings and scores persist in `localStorage`.

### Report Bug button

The small **REPORT BUG** button (bottom-right) captures the current game state, recent errors and your description.

- **OPEN GITHUB ISSUE** (hosted build and local dev) — opens a prefilled issue on this repo, labelled `bug` and mentioning `@devin`. Connect the repo to Devin at app.devin.ai and it can pick the issue up, reproduce with `npm run smoke`, fix, and open a PR.
- **SEND TO DEVIN** (local dev server only) — creates a Devin Cloud session directly via the API. Needs credentials that must never ship to the browser, so the dev/preview server proxies the request. Copy `.env.example` to `.env.local` and fill in `DEVIN_API_KEY` (service-user key), `DEVIN_ORG_ID` and `DEVIN_REPO`.
- **COPY REPORT** — the same text on your clipboard.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, tests and build, then publish `dist/` to GitHub Pages (project site at `https://<user>.github.io/arcade-battleship/`). The workflow sets the Vite `base` path and the repo URL for issue links automatically. Enable Pages once with source "GitHub Actions" (Settings → Pages), or `gh api -X POST repos/<user>/arcade-battleship/pages -f build_type=workflow`.

### Scoring

100 per hit, doubling with consecutive hits (capped at x3), plus 50 x ship length when a ship sinks. Winning adds an accuracy bonus (accuracy% x 10) and an efficiency bonus (20 per unused shot). Everything is multiplied by the rank: x1 / x1.5 / x2 / x3.

## Develop

```sh
npm run typecheck   # strict tsc
npm test            # vitest: rules, scoring, state machine, AI behaviour + seeded strength simulation
npm run ai:bench    # average shots-to-win per tier (node scripts/ai-bench.ts)
npm run smoke       # headless Chrome click-through of every screen (needs `npm run dev` running; pass url=https://... to test a deployed build)
npm run build       # production bundle in dist/
```

See `AGENTS.md` for the code layout and conventions.
