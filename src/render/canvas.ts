import { GRID_SIZE } from '../core/constants.ts';
import type { Coord } from '../core/coord.ts';

/** Art pixels per cell in the procedural sprites. */
export const ART_PX = 8;

/**
 * A DPR-aware canvas laid out as a label gutter (top row / left column) plus a
 * GRID_SIZE x GRID_SIZE board. All public coordinates are CSS pixels; the
 * backing store is scaled by devicePixelRatio and drawn with nearest-neighbour
 * sampling so pixel art stays crisp.
 */
export class BoardCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly size = GRID_SIZE;
  cell: number;
  gutter: number;
  width: number;
  height: number;
  dpr: number;

  constructor(canvas: HTMLCanvasElement, cell: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;
    this.cell = cell;
    this.gutter = cell;
    this.width = this.height = 0;
    this.dpr = 1;
    this.resize(cell);
  }

  resize(cell: number): void {
    this.cell = cell;
    this.gutter = cell;
    this.width = this.gutter + this.size * cell;
    this.height = this.gutter + this.size * cell;
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Device pixels per art pixel for sprites rendered at this cell size. */
  get spriteScale(): number {
    return Math.max(1, Math.round((this.cell * this.dpr) / ART_PX));
  }

  /** CSS px size of one art pixel. */
  get artPx(): number {
    return this.cell / ART_PX;
  }

  cellOrigin(x: number, y: number): { px: number; py: number } {
    return { px: this.gutter + x * this.cell, py: this.gutter + y * this.cell };
  }

  cellCenter(x: number, y: number): { px: number; py: number } {
    const o = this.cellOrigin(x, y);
    return { px: o.px + this.cell / 2, py: o.py + this.cell / 2 };
  }

  /** Board cell under a client (mouse) position, or undefined if outside the grid. */
  cellAt(clientX: number, clientY: number): Coord | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    const px = (clientX - rect.left) * scaleX - this.gutter;
    const py = (clientY - rect.top) * scaleY - this.gutter;
    if (px < 0 || py < 0) return undefined;
    const x = Math.floor(px / this.cell);
    const y = Math.floor(py / this.cell);
    if (x >= this.size || y >= this.size) return undefined;
    return { x, y };
  }
}

/** Picks a cell size (multiple of 4) so `boards` boards fit side by side in `availableWidth`. */
export function fitCellSize(availableWidth: number, boards: number, min = 24, max = 44): number {
  const perBoard = availableWidth / boards;
  const raw = Math.floor(perBoard / (GRID_SIZE + 1));
  return Math.max(min, Math.min(max, Math.floor(raw / 4) * 4));
}
