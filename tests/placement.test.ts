import { describe, expect, it } from 'vitest';
import {
  cellsTouch,
  findabilityScore,
  legalPlacements,
  placeAdversarialFleet,
  placeRandomFleet,
} from '../src/core/ai/placement.ts';
import { Board } from '../src/core/board.ts';
import { FLEET } from '../src/core/constants.ts';
import { keyOf } from '../src/core/coord.ts';
import { createRng } from '../src/core/rng.ts';
import { spec } from './helpers.ts';

function assertValidFleet(board: Board): void {
  expect(board.isFleetComplete).toBe(true);
  const seen = new Set<number>();
  for (const ship of board.ships) {
    for (const c of ship.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(board.size);
      expect(c.y).toBeLessThan(board.size);
      expect(seen.has(keyOf(c))).toBe(false);
      seen.add(keyOf(c));
    }
  }
  expect(seen.size).toBe(FLEET.reduce((n, s) => n + s.length, 0));
}

describe('fleet placement', () => {
  it('enumerates every legal placement on an empty board', () => {
    expect(legalPlacements(new Board(), spec('carrier'))).toHaveLength(2 * 6 * 10);
    expect(legalPlacements(new Board(), spec('destroyer'))).toHaveLength(2 * 9 * 10);
  });

  it('places a valid random fleet every time', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const board = new Board();
      placeRandomFleet(board, rng);
      assertValidFleet(board);
    }
  });

  it('places a valid adversarial fleet that is harder to find than average', () => {
    const rng = createRng(99);
    let randomScore = 0;
    let adversarialScore = 0;
    let touchingAdversarial = 0;
    const trials = 20;
    for (let i = 0; i < trials; i++) {
      const random = new Board();
      placeRandomFleet(random, rng);
      randomScore += findabilityScore(random);

      const adversarial = new Board();
      placeAdversarialFleet(adversarial, rng, 100);
      assertValidFleet(adversarial);
      adversarialScore += findabilityScore(adversarial);
      const cells = adversarial.ships.flatMap((s) => s.cells.map((c) => ({ c, s })));
      if (cells.some((a) => cells.some((b) => a.s !== b.s && cellsTouch(a.c, b.c)))) touchingAdversarial++;
    }
    expect(adversarialScore).toBeLessThan(randomScore * 0.7);
    expect(touchingAdversarial).toBeLessThanOrEqual(trials / 4);
  });
});
