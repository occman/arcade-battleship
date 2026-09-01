import { describe, expect, it } from 'vitest';
import { createAI } from '../src/core/ai/index.ts';
import { placeRandomFleet } from '../src/core/ai/placement.ts';
import { Board } from '../src/core/board.ts';
import type { Difficulty } from '../src/core/constants.ts';
import { createRng } from '../src/core/rng.ts';
import { playOut } from './helpers.ts';

const GAMES = 200;

function meanShots(difficulty: Difficulty, seed: number): number {
  const rng = createRng(seed);
  let total = 0;
  for (let i = 0; i < GAMES; i++) {
    const board = new Board();
    placeRandomFleet(board, rng);
    total += playOut(createAI(difficulty, rng), board).length;
  }
  return total / GAMES;
}

describe('AI tiers are ordered by strength (seeded simulation)', () => {
  const means = {
    cadet: meanShots('cadet', 101),
    lieutenant: meanShots('lieutenant', 102),
    captain: meanShots('captain', 103),
    admiral: meanShots('admiral', 104),
  };

  it('ranks Cadet < Lieutenant < Captain < Admiral by mean shots to win', () => {
    expect(means.cadet).toBeGreaterThan(means.lieutenant + 20);
    expect(means.lieutenant).toBeGreaterThan(means.captain + 6);
    expect(means.captain).toBeGreaterThan(means.admiral + 1);
  });

  it('lands each tier in its expected band', () => {
    expect(means.cadet).toBeGreaterThan(90);
    expect(means.lieutenant).toBeGreaterThan(55);
    expect(means.lieutenant).toBeLessThan(70);
    expect(means.captain).toBeGreaterThan(44);
    expect(means.captain).toBeLessThan(53);
    expect(means.admiral).toBeGreaterThan(40);
    expect(means.admiral).toBeLessThan(49);
  });
});
