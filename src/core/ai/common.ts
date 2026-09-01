import type { Board } from '../board.ts';
import type { Coord } from '../coord.ts';
import type { ShotView } from './types.ts';

/** The opponent's-eye view of a board: marks and ship lengths only. */
export function viewOfBoard(board: Board): ShotView {
  return {
    size: board.size,
    remainingLengths: board.remainingShips.map((s) => s.length),
    sunkLengths: board.ships.filter((s) => s.isSunk).map((s) => s.length),
    markAt: (x, y) => board.markAt({ x, y }),
  };
}

export function untriedCells(view: ShotView): Coord[] {
  const cells: Coord[] = [];
  for (let y = 0; y < view.size; y++) {
    for (let x = 0; x < view.size; x++) {
      if (view.markAt(x, y) === undefined) cells.push({ x, y });
    }
  }
  return cells;
}

export const isUntried = (view: ShotView, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < view.size && y < view.size && view.markAt(x, y) === undefined;
