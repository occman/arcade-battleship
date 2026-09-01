import { GRID_SIZE } from './constants.ts';

export interface Coord {
  readonly x: number;
  readonly y: number;
}

export type Orientation = 'h' | 'v';

/** Dense integer key for a cell, usable in Sets/Maps. */
export const coordKey = (x: number, y: number): number => y * GRID_SIZE + x;
export const keyOf = (c: Coord): number => coordKey(c.x, c.y);
export const fromKey = (k: number): Coord => ({ x: k % GRID_SIZE, y: Math.floor(k / GRID_SIZE) });

export const inBounds = (x: number, y: number, size: number = GRID_SIZE): boolean =>
  x >= 0 && y >= 0 && x < size && y < size;

export const sameCoord = (a: Coord, b: Coord): boolean => a.x === b.x && a.y === b.y;

export function neighbors4(c: Coord, size: number = GRID_SIZE): Coord[] {
  const out: Coord[] = [];
  if (c.x > 0) out.push({ x: c.x - 1, y: c.y });
  if (c.x < size - 1) out.push({ x: c.x + 1, y: c.y });
  if (c.y > 0) out.push({ x: c.x, y: c.y - 1 });
  if (c.y < size - 1) out.push({ x: c.x, y: c.y + 1 });
  return out;
}

/** Cells of a straight segment starting at origin (may extend out of bounds). */
export function segmentCells(origin: Coord, length: number, orientation: Orientation): Coord[] {
  const cells: Coord[] = [];
  for (let i = 0; i < length; i++) {
    cells.push(orientation === 'h' ? { x: origin.x + i, y: origin.y } : { x: origin.x, y: origin.y + i });
  }
  return cells;
}

export function allCoords(size: number = GRID_SIZE): Coord[] {
  const cells: Coord[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x, y });
  return cells;
}

/** Board notation, e.g. {x:1,y:6} -> "B7". */
export const coordLabel = (c: Coord): string => `${String.fromCharCode(65 + c.x)}${c.y + 1}`;
