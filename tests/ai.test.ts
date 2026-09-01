import { describe, expect, it } from 'vitest';
import { AdmiralStrategy } from '../src/core/ai/admiral.ts';
import { viewOfBoard } from '../src/core/ai/common.ts';
import { DensityBrain } from '../src/core/ai/density.ts';
import { createAI } from '../src/core/ai/index.ts';
import { LieutenantStrategy } from '../src/core/ai/lieutenant.ts';
import { placeRandomFleet } from '../src/core/ai/placement.ts';
import type { AIStrategy } from '../src/core/ai/types.ts';
import { Board } from '../src/core/board.ts';
import { DIFFICULTIES } from '../src/core/constants.ts';
import { coordKey, keyOf, neighbors4, sameCoord, type Coord } from '../src/core/coord.ts';
import { createRng } from '../src/core/rng.ts';
import { boardWith, playOut } from './helpers.ts';

/** Fire a scripted sequence and tell the AI what happened. */
function feed(ai: AIStrategy, board: Board, shots: Coord[]): void {
  for (const c of shots) {
    const r = board.fire(c);
    if (r.outcome !== 'hit' && r.outcome !== 'miss') throw new Error(`bad scripted shot ${c.x},${c.y}`);
    ai.observe(c, { outcome: r.outcome, sunk: r.sunk ? { name: r.sunk.name, length: r.sunk.length } : undefined });
  }
}

describe.each(DIFFICULTIES.map((d) => d.id))('%s strategy', (difficulty) => {
  it('never repeats a shot and always sinks a random fleet within 100 shots', () => {
    const rng = createRng(1234);
    for (let i = 0; i < 25; i++) {
      const board = new Board();
      placeRandomFleet(board, rng);
      const shots = playOut(createAI(difficulty, rng), board);
      expect(new Set(shots.map(keyOf)).size).toBe(shots.length);
      expect(board.allSunk).toBe(true);
      expect(shots.length).toBeLessThanOrEqual(100);
    }
  });

  it('places a complete fleet of its own', () => {
    const board = new Board();
    createAI(difficulty, createRng(5)).placeFleet(board);
    expect(board.isFleetComplete).toBe(true);
  });
});

describe('Lieutenant', () => {
  it('probes a neighbour after a lone hit', () => {
    const board = boardWith({ cruiser: { x: 4, y: 4, o: 'h' } });
    const ai = new LieutenantStrategy(createRng(3));
    feed(ai, board, [{ x: 5, y: 4 }]);
    for (let i = 0; i < 10; i++) {
      const shot = ai.chooseShot(viewOfBoard(board));
      expect(neighbors4({ x: 5, y: 4 }).some((n) => sameCoord(n, shot))).toBe(true);
    }
  });

  it('extends a line once two hits are collinear', () => {
    const board = boardWith({ carrier: { x: 2, y: 7, o: 'h' } });
    const ai = new LieutenantStrategy(createRng(3));
    feed(ai, board, [{ x: 4, y: 7 }, { x: 5, y: 7 }]);
    for (let i = 0; i < 10; i++) {
      const shot = ai.chooseShot(viewOfBoard(board));
      expect([{ x: 3, y: 7 }, { x: 6, y: 7 }].some((c) => sameCoord(c, shot))).toBe(true);
    }
  });

  it('hunts on a single parity when configured to', () => {
    const ai = new LieutenantStrategy(createRng(11), { parityHunt: true, lineTargeting: true });
    const board = boardWith({ destroyer: { x: 0, y: 0, o: 'h' } });
    const parities = new Set<number>();
    for (let i = 0; i < 15; i++) {
      const shot = ai.chooseShot(viewOfBoard(board));
      parities.add((shot.x + shot.y) % 2);
      board.fire(shot);
      ai.observe(shot, { outcome: 'miss' }); // pretend everything misses
    }
    expect(parities.size).toBe(1);
  });
});

describe('DensityBrain attribution', () => {
  it('attributes an isolated sunk ship to its exact cells', () => {
    const board = boardWith({ cruiser: { x: 2, y: 2, o: 'h' }, destroyer: { x: 7, y: 7, o: 'v' } });
    const brain = new DensityBrain();
    const shots: Coord[] = [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 2 }];
    for (const c of shots) {
      const r = board.fire(c);
      brain.observe(c, { outcome: 'hit', sunk: r.sunk ? { name: r.sunk.name, length: r.sunk.length } : undefined });
    }
    const attributions = brain.attributions();
    expect(attributions).toHaveLength(1);
    expect([...attributions[0]!].sort()).toEqual(shots.map(keyOf).sort());
  });

  it('keeps every hypothesis when touching ships make the sunk cells ambiguous', () => {
    // Two length-3 ships end to end on row 5: cruiser at x=2..4, submarine at x=5..7.
    // Hits at x=2,3,5 then the killing shot at x=4 leaves a run of four hits; both
    // windows [2,3,4] and [3,4,5] contain the kill cell, so the sunk cells are ambiguous.
    const board = boardWith({ cruiser: { x: 2, y: 5, o: 'h' }, submarine: { x: 5, y: 5, o: 'h' } });
    const brain = new DensityBrain();
    for (const c of [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }] as Coord[]) {
      const r = board.fire(c);
      brain.observe(c, { outcome: 'hit', sunk: r.sunk ? { name: r.sunk.name, length: r.sunk.length } : undefined });
    }
    const attributions = brain.attributions();
    expect(attributions).toHaveLength(2);
    const sets = attributions.map((a) => [...a].sort((p, q) => p - q));
    expect(sets).toContainEqual([coordKey(2, 5), coordKey(3, 5), coordKey(4, 5)]);
    expect(sets).toContainEqual([coordKey(3, 5), coordKey(4, 5), coordKey(5, 5)]);
  });
});

describe('Admiral', () => {
  it('finishes a touching pair of ships without losing track of the survivor', () => {
    const board = boardWith({
      cruiser: { x: 2, y: 5, o: 'h' },
      submarine: { x: 5, y: 5, o: 'h' },
      carrier: { x: 0, y: 0, o: 'h' },
      battleship: { x: 0, y: 9, o: 'h' },
      destroyer: { x: 9, y: 0, o: 'v' },
    });
    const ai = new AdmiralStrategy(createRng(8));
    feed(ai, board, [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]); // cruiser sunk, sub hit once
    // The kill cell (4,5) sits in a run of four hits, so either (2,5) or (5,5) may be the
    // surviving ship's hit. The next shot must probe next to one of them...
    const next = ai.chooseShot(viewOfBoard(board));
    const openHits = [{ x: 2, y: 5 }, { x: 5, y: 5 }];
    expect(openHits.some((h) => neighbors4(h).some((n) => sameCoord(n, next)))).toBe(true);
    // ...and the submarine must go down within a handful of shots.
    let shots = 0;
    while (!board.getShip('submarine')!.isSunk && shots < 8) {
      const c = ai.chooseShot(viewOfBoard(board));
      feed(ai, board, [c]);
      shots++;
    }
    expect(board.getShip('submarine')!.isSunk).toBe(true);
    expect(shots).toBeLessThanOrEqual(6);
  });

  it('only fires at cells that could hold a remaining ship', () => {
    const board = boardWith({ destroyer: { x: 0, y: 0, o: 'h' } });
    const ai = new AdmiralStrategy(createRng(2));
    // Misses fence off every placement through (0,0) except the destroyer's real one.
    feed(ai, board, [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
    expect(ai.chooseShot(viewOfBoard(board))).toEqual({ x: 1, y: 0 });
  });
});
