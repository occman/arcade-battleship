# Arcade Battleship

A retro 80s neon-arcade take on Battleship, played in the browser against an AI with four difficulty tiers. Pixel-art fleets, explosions, screen shake, chiptune audio, CRT scanlines and a high-score table with three-letter initials. No runtime dependencies: everything is drawn on `<canvas>` and synthesised with the Web Audio API.

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

Toggles on the title screen: **SFX**, **MUSIC**, **CRT** overlay, **REDUCE FX** (shorter animations, no flashes; on by default if your OS asks for reduced motion). Settings and scores persist in `localStorage`.

### Scoring

100 per hit, doubling with consecutive hits (capped at x3), plus 50 x ship length when a ship sinks. Winning adds an accuracy bonus (accuracy% x 10) and an efficiency bonus (20 per unused shot). Everything is multiplied by the rank: x1 / x1.5 / x2 / x3.

## Develop

```sh
npm run typecheck   # strict tsc
npm test            # vitest: rules, scoring, state machine, AI behaviour + seeded strength simulation
npm run ai:bench    # average shots-to-win per tier (node scripts/ai-bench.ts)
npm run smoke       # headless Chrome click-through of every screen (needs `npm run dev` running)
npm run build       # production bundle in dist/
```

See `AGENTS.md` for the code layout and conventions.
