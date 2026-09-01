import { viewOfBoard } from '../src/core/ai/common.ts';
import type { AIStrategy } from '../src/core/ai/types.ts';
import { Board } from '../src/core/board.ts';
import { FLEET, shipSpec, type ShipId } from '../src/core/constants.ts';
import type { Coord, Orientation } from '../src/core/coord.ts';

export type Layout = Partial<Record<ShipId, { x: number; y: number; o: Orientation }>>;

/** A board with ships at explicit positions (any ships omitted are left unplaced). */
export function boardWith(layout: Layout): Board {
  const board = new Board();
  for (const spec of FLEET) {
    const p = layout[spec.id];
    if (p) board.place(spec, { origin: { x: p.x, y: p.y }, orientation: p.o });
  }
  return board;
}

/** A complete, non-touching reference layout. */
export const STANDARD_LAYOUT: Layout = {
  carrier: { x: 0, y: 0, o: 'h' },
  battleship: { x: 0, y: 2, o: 'h' },
  cruiser: { x: 0, y: 4, o: 'h' },
  submarine: { x: 0, y: 6, o: 'h' },
  destroyer: { x: 0, y: 8, o: 'h' },
};

/** Lets an AI shoot at a board until every ship is sunk; returns the shots fired. */
export function playOut(ai: AIStrategy, board: Board, maxShots = 100): Coord[] {
  const shots: Coord[] = [];
  while (!board.allSunk && shots.length < maxShots) {
    const coord = ai.chooseShot(viewOfBoard(board));
    const result = board.fire(coord);
    if (result.outcome !== 'hit' && result.outcome !== 'miss') {
      throw new Error(`Illegal AI shot ${coord.x},${coord.y}: ${result.outcome}`);
    }
    shots.push(coord);
    ai.observe(coord, {
      outcome: result.outcome,
      sunk: result.sunk ? { name: result.sunk.name, length: result.sunk.length } : undefined,
    });
  }
  return shots;
}

export const spec = shipSpec;
