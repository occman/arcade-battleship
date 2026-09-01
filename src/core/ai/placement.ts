import { Board } from '../board.ts';
import { FLEET, type ShipSpec } from '../constants.ts';
import { keyOf, neighbors4, type Coord, type Orientation } from '../coord.ts';
import type { Rng } from '../rng.ts';
import type { Placement } from '../ship.ts';

/** Every legal placement for a ship on the current board. */
export function legalPlacements(board: Board, spec: ShipSpec): Placement[] {
  const out: Placement[] = [];
  for (const orientation of ['h', 'v'] as const) {
    const maxX = orientation === 'h' ? board.size - spec.length : board.size - 1;
    const maxY = orientation === 'v' ? board.size - spec.length : board.size - 1;
    for (let y = 0; y <= maxY; y++) {
      for (let x = 0; x <= maxX; x++) {
        const placement = { origin: { x, y }, orientation };
        if (board.canPlace(spec, placement)) out.push(placement);
      }
    }
  }
  return out;
}

export function randomPlacement(board: Board, spec: ShipSpec, rng: Rng): Placement | undefined {
  const options = legalPlacements(board, spec);
  return options.length ? rng.pick(options) : undefined;
}

/** Clears the board and places the whole fleet uniformly at random. */
export function placeRandomFleet(board: Board, rng: Rng): void {
  for (let attempt = 0; attempt < 50; attempt++) {
    board.clear();
    let ok = true;
    for (const spec of FLEET) {
      const placement = randomPlacement(board, spec, rng);
      if (!placement) {
        ok = false;
        break;
      }
      board.place(spec, placement);
    }
    if (ok) return;
  }
  throw new Error('Could not place fleet');
}

/**
 * Heuristic cost of a fleet layout from the human's point of view: how quickly
 * a typical human (centre-first, neighbour-probing) would find it. Lower = harder.
 */
export function findabilityScore(board: Board): number {
  const centre = (board.size - 1) / 2;
  let score = 0;
  const occupied = new Set<number>();
  for (const ship of board.ships) for (const c of ship.cells) occupied.add(keyOf(c));
  for (const ship of board.ships) {
    for (const c of ship.cells) {
      // Humans tend to probe the middle first.
      const centrality = 1 - (Math.abs(c.x - centre) + Math.abs(c.y - centre)) / (2 * centre);
      score += centrality * 2;
      // Touching ships are found while probing a neighbour.
      for (const n of neighbors4(c, board.size)) {
        if (occupied.has(keyOf(n)) && !ship.contains(n)) score += 1.5;
      }
    }
  }
  // All ships the same orientation makes line-hunting easier.
  const orientations = new Set<Orientation>(board.ships.map((s) => s.orientation));
  if (orientations.size === 1) score += 3;
  return score;
}

/**
 * Samples many random fleets and keeps one of the hardest-to-find, picked at
 * random from the best fifth so the layout stays unpredictable.
 */
export function placeAdversarialFleet(board: Board, rng: Rng, samples = 200): void {
  const candidates: { layout: { spec: ShipSpec; placement: Placement }[]; score: number }[] = [];
  const scratch = new Board();
  for (let i = 0; i < samples; i++) {
    placeRandomFleet(scratch, rng);
    candidates.push({
      layout: scratch.ships.map((s) => ({ spec: s.spec, placement: s.placement })),
      score: findabilityScore(scratch),
    });
  }
  candidates.sort((a, b) => a.score - b.score);
  const pool = candidates.slice(0, Math.max(1, Math.floor(samples / 5)));
  const chosen = rng.pick(pool);
  board.clear();
  for (const { spec, placement } of chosen.layout) board.place(spec, placement);
}

export const cellsTouch = (a: Coord, b: Coord): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
