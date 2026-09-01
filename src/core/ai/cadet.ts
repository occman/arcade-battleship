import type { Board } from '../board.ts';
import type { Coord } from '../coord.ts';
import type { Rng } from '../rng.ts';
import { untriedCells } from './common.ts';
import { placeRandomFleet } from './placement.ts';
import type { AIStrategy, ShotView } from './types.ts';

/** Easy: fires uniformly at random and never follows up a hit. */
export class CadetStrategy implements AIStrategy {
  readonly id = 'cadet' as const;
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  placeFleet(board: Board): void {
    placeRandomFleet(board, this.rng);
  }

  chooseShot(view: ShotView): Coord {
    return this.rng.pick(untriedCells(view));
  }

  observe(): void {
    // Cadets don't learn.
  }
}
