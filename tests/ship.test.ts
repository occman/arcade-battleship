import { describe, expect, it } from 'vitest';
import { shipSpec } from '../src/core/constants.ts';
import { Ship } from '../src/core/ship.ts';

describe('Ship', () => {
  it('occupies a straight run of cells', () => {
    const ship = new Ship(shipSpec('cruiser'), { origin: { x: 4, y: 1 }, orientation: 'v' });
    expect(ship.cells).toEqual([
      { x: 4, y: 1 },
      { x: 4, y: 2 },
      { x: 4, y: 3 },
    ]);
    expect(ship.contains({ x: 4, y: 3 })).toBe(true);
    expect(ship.contains({ x: 5, y: 3 })).toBe(false);
  });

  it('sinks only when every cell is hit, ignoring duplicate hits', () => {
    const ship = new Ship(shipSpec('destroyer'), { origin: { x: 0, y: 0 }, orientation: 'h' });
    expect(ship.registerHit({ x: 0, y: 0 })).toBe(true);
    expect(ship.registerHit({ x: 0, y: 0 })).toBe(false);
    expect(ship.registerHit({ x: 7, y: 7 })).toBe(false);
    expect(ship.isSunk).toBe(false);
    expect(ship.hitCount).toBe(1);
    expect(ship.registerHit({ x: 1, y: 0 })).toBe(true);
    expect(ship.isSunk).toBe(true);
  });
});
