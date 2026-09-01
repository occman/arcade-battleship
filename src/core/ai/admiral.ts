import type { Board } from '../board.ts';
import type { Coord } from '../coord.ts';
import type { Rng } from '../rng.ts';
import { DensityBrain, type DensityOptions } from './density.ts';
import { placeAdversarialFleet } from './placement.ts';
import type { AIStrategy, ShotFeedback, ShotView } from './types.ts';

/** ~45 shots per game, the practical ceiling for placement-density targeting. */
export const ADMIRAL_OPTIONS: DensityOptions = {
  strictTargeting: true,
  hitBonus: 4,
  exactAttribution: true,
  huntTopK: 1,
  targetSlack: 1,
};

/** Hardest: exact density targeting, full sunk-ship attribution, and a fleet hidden on purpose. */
export class AdmiralStrategy implements AIStrategy {
  readonly id = 'admiral' as const;
  private readonly rng: Rng;
  private readonly brain = new DensityBrain();

  constructor(rng: Rng) {
    this.rng = rng;
  }

  placeFleet(board: Board): void {
    placeAdversarialFleet(board, this.rng);
  }

  chooseShot(view: ShotView): Coord {
    return this.brain.chooseShot(view, this.rng, ADMIRAL_OPTIONS);
  }

  observe(coord: Coord, feedback: ShotFeedback): void {
    this.brain.observe(coord, feedback);
  }
}
