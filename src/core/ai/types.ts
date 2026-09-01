import type { Board, CellMark } from '../board.ts';
import type { Difficulty } from '../constants.ts';
import type { Coord } from '../coord.ts';

/**
 * Everything an AI is allowed to know about the human's ocean: exactly what a
 * human player sees on their own target grid. Never exposes ship positions.
 */
export interface ShotView {
  readonly size: number;
  /** Lengths of enemy ships not yet sunk. */
  readonly remainingLengths: readonly number[];
  /** Lengths of enemy ships already sunk. */
  readonly sunkLengths: readonly number[];
  markAt(x: number, y: number): CellMark | undefined;
}

export interface ShotFeedback {
  readonly outcome: 'hit' | 'miss';
  /** Present when this shot sank a ship. */
  readonly sunk?: { readonly name: string; readonly length: number };
}

export interface AIStrategy {
  readonly id: Difficulty;
  /** Place the AI's own fleet on its board. */
  placeFleet(board: Board): void;
  /** Pick the next cell to fire at. Must never return an already-shot cell. */
  chooseShot(view: ShotView): Coord;
  /** Learn from the result of the last shot. */
  observe(coord: Coord, feedback: ShotFeedback): void;
}
