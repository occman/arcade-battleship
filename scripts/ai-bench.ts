/**
 * Simulates every AI tier against random fleets and prints shots-to-win stats.
 * Usage: npm run ai:bench [-- games=500 seed=1]
 */
import { viewOfBoard } from '../src/core/ai/common.ts';
import { createAI } from '../src/core/ai/index.ts';
import { placeRandomFleet } from '../src/core/ai/placement.ts';
import { Board } from '../src/core/board.ts';
import { DIFFICULTIES } from '../src/core/constants.ts';
import { createRng } from '../src/core/rng.ts';

declare const process: { argv: string[] };

const args = Object.fromEntries(process.argv.slice(2).map((a: string) => a.split('=') as [string, string]));
const games = Number(args['games'] ?? 500);
const seed = Number(args['seed'] ?? 1);

for (const { id, rank } of DIFFICULTIES) {
  const rng = createRng(seed);
  const counts: number[] = [];
  const started = performance.now();
  for (let g = 0; g < games; g++) {
    const board = new Board();
    placeRandomFleet(board, rng);
    const ai = createAI(id, rng);
    let shots = 0;
    while (!board.allSunk) {
      const c = ai.chooseShot(viewOfBoard(board));
      const r = board.fire(c);
      if (r.outcome !== 'hit' && r.outcome !== 'miss') throw new Error(`${id} fired an illegal shot`);
      ai.observe(c, { outcome: r.outcome, sunk: r.sunk ? { name: r.sunk.name, length: r.sunk.length } : undefined });
      shots++;
    }
    counts.push(shots);
  }
  counts.sort((a, b) => a - b);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const pct = (p: number) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
  const ms = ((performance.now() - started) / games).toFixed(2);
  console.log(
    `${rank.padEnd(11)} mean ${mean.toFixed(1).padStart(5)}  p10 ${String(pct(0.1)).padStart(3)}  ` +
      `p50 ${String(pct(0.5)).padStart(3)}  p90 ${String(pct(0.9)).padStart(3)}  ` +
      `min ${String(counts[0]).padStart(3)}  max ${String(counts.at(-1)).padStart(3)}  (${ms} ms/game)`,
  );
}
