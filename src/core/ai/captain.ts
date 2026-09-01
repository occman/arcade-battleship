import type { Board } from '../board.ts';
import type { Coord } from '../coord.ts';
import type { Rng } from '../rng.ts';
import { DensityBrain, type DensityOptions } from './density.ts';
import { placeRandomFleet } from './placement.ts';
import type { AIStrategy, ShotFeedback, ShotView } from './types.ts';

/** Tuned to ~48 shots per game: density targeting with human-like slack in both hunting and finishing. */
export const CAPTAIN_OPTIONS: DensityOptions = {
  strictTargeting: false,
  hitBonus: 4,
  exactAttribution: false,
  huntTopK: 8,
  targetSlack: 0.6,
};

/** Hard: probability-density targeting with a little slack. */
export class CaptainStrategy implements AIStrategy {
  readonly id = 'captain' as const;
  private readonly rng: Rng;
  private readonly brain = new DensityBrain();

  constructor(rng: Rng) {
    this.rng = rng;
  }

  placeFleet(board: Board): void {
    placeRandomFleet(board, this.rng);
  }

  chooseShot(view: ShotView): Coord {
    return this.brain.chooseShot(view, this.rng, CAPTAIN_OPTIONS);
  }

  observe(coord: Coord, feedback: ShotFeedback): void {
    this.brain.observe(coord, feedback);
  }
}
