import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board.ts';
import { FLEET } from '../src/core/constants.ts';
import { boardWith, spec, STANDARD_LAYOUT } from './helpers.ts';

describe('Board placement', () => {
  it('rejects ships that hang off the grid', () => {
    const board = new Board();
    expect(board.canPlace(spec('carrier'), { origin: { x: 6, y: 0 }, orientation: 'h' })).toBe(false);
    expect(board.canPlace(spec('carrier'), { origin: { x: 5, y: 0 }, orientation: 'h' })).toBe(true);
    expect(board.canPlace(spec('destroyer'), { origin: { x: 0, y: 9 }, orientation: 'v' })).toBe(false);
    expect(board.canPlace(spec('destroyer'), { origin: { x: -1, y: 0 }, orientation: 'h' })).toBe(false);
  });

  it('rejects overlap but allows touching', () => {
    const board = boardWith({ cruiser: { x: 3, y: 3, o: 'h' } });
    expect(board.canPlace(spec('destroyer'), { origin: { x: 4, y: 2 }, orientation: 'v' })).toBe(false); // crosses (4,3)
    expect(board.canPlace(spec('destroyer'), { origin: { x: 3, y: 4 }, orientation: 'h' })).toBe(true); // directly below
    expect(board.canPlace(spec('destroyer'), { origin: { x: 6, y: 3 }, orientation: 'h' })).toBe(true); // end to end
    expect(() => board.place(spec('destroyer'), { origin: { x: 4, y: 2 }, orientation: 'v' })).toThrow();
  });

  it('refuses to place the same ship twice and supports removal', () => {
    const board = boardWith({ submarine: { x: 0, y: 0, o: 'h' } });
    expect(() => board.place(spec('submarine'), { origin: { x: 0, y: 5 }, orientation: 'h' })).toThrow(/already/);
    expect(board.remove('submarine')?.id).toBe('submarine');
    expect(board.remove('submarine')).toBeUndefined();
    expect(board.shipAt({ x: 0, y: 0 })).toBeUndefined();
    expect(board.canPlace(spec('submarine'), { origin: { x: 0, y: 0 }, orientation: 'h' })).toBe(true);
  });

  it('knows when the fleet is complete', () => {
    const board = boardWith(STANDARD_LAYOUT);
    expect(board.isFleetComplete).toBe(true);
    board.remove('destroyer');
    expect(board.isFleetComplete).toBe(false);
    expect(board.ships).toHaveLength(FLEET.length - 1);
  });
});

describe('Board firing', () => {
  it('reports hits, misses, repeats and invalid coordinates', () => {
    const board = boardWith(STANDARD_LAYOUT);
    expect(board.fire({ x: 0, y: 0 })).toMatchObject({ outcome: 'hit', fleetDestroyed: false });
    expect(board.fire({ x: 0, y: 0 }).outcome).toBe('repeat');
    expect(board.fire({ x: 9, y: 9 }).outcome).toBe('miss');
    expect(board.fire({ x: 9, y: 9 }).outcome).toBe('repeat');
    expect(board.fire({ x: 10, y: 0 }).outcome).toBe('invalid');
    expect(board.markAt({ x: 0, y: 0 })).toBe('hit');
    expect(board.markAt({ x: 9, y: 9 })).toBe('miss');
    expect(board.markAt({ x: 5, y: 5 })).toBeUndefined();
    expect(board.shotCount).toBe(2);
    expect(board.hitCount).toBe(1);
  });

  it('reports the ship sunk by the final hit', () => {
    const board = boardWith(STANDARD_LAYOUT);
    expect(board.fire({ x: 0, y: 8 }).sunk).toBeUndefined();
    const result = board.fire({ x: 1, y: 8 });
    expect(result.sunk?.id).toBe('destroyer');
    expect(result.ship?.id).toBe('destroyer');
    expect(result.fleetDestroyed).toBe(false);
    expect(board.remainingShips.map((s) => s.id)).not.toContain('destroyer');
  });

  it('flags fleet destruction on the last hit only', () => {
    const board = boardWith(STANDARD_LAYOUT);
    const cells = board.ships.flatMap((s) => s.cells);
    const last = cells.pop()!;
    for (const c of cells) expect(board.fire(c).fleetDestroyed).toBe(false);
    expect(board.allSunk).toBe(false);
    expect(board.fire(last).fleetDestroyed).toBe(true);
    expect(board.allSunk).toBe(true);
  });

  it('is not "all sunk" while empty', () => {
    expect(new Board().allSunk).toBe(false);
  });
});
