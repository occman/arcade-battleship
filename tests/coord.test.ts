import { describe, expect, it } from 'vitest';
import { GRID_SIZE } from '../src/core/constants.ts';
import { allCoords, coordKey, coordLabel, fromKey, inBounds, neighbors4, segmentCells } from '../src/core/coord.ts';

describe('coord', () => {
  it('round-trips keys', () => {
    for (const c of allCoords()) expect(fromKey(coordKey(c.x, c.y))).toEqual(c);
    expect(new Set(allCoords().map((c) => coordKey(c.x, c.y))).size).toBe(GRID_SIZE * GRID_SIZE);
  });

  it('checks bounds', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(9, 9)).toBe(true);
    expect(inBounds(10, 0)).toBe(false);
    expect(inBounds(0, -1)).toBe(false);
  });

  it('lists in-bounds neighbours only', () => {
    expect(neighbors4({ x: 0, y: 0 })).toHaveLength(2);
    expect(neighbors4({ x: 5, y: 5 })).toHaveLength(4);
    expect(neighbors4({ x: 9, y: 4 })).toHaveLength(3);
  });

  it('builds straight segments', () => {
    expect(segmentCells({ x: 2, y: 3 }, 3, 'h')).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
    expect(segmentCells({ x: 2, y: 3 }, 2, 'v')).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
  });

  it('labels cells in board notation', () => {
    expect(coordLabel({ x: 0, y: 0 })).toBe('A1');
    expect(coordLabel({ x: 9, y: 9 })).toBe('J10');
    expect(coordLabel({ x: 1, y: 6 })).toBe('B7');
  });
});
