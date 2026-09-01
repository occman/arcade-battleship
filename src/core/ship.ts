import type { ShipId, ShipSpec } from './constants.ts';
import { keyOf, segmentCells, type Coord, type Orientation } from './coord.ts';

export interface Placement {
  readonly origin: Coord;
  readonly orientation: Orientation;
}

export class Ship {
  readonly spec: ShipSpec;
  readonly placement: Placement;
  readonly cells: readonly Coord[];
  private readonly hitKeys = new Set<number>();

  constructor(spec: ShipSpec, placement: Placement) {
    this.spec = spec;
    this.placement = placement;
    this.cells = segmentCells(placement.origin, spec.length, placement.orientation);
  }

  get id(): ShipId {
    return this.spec.id;
  }
  get name(): string {
    return this.spec.name;
  }
  get length(): number {
    return this.spec.length;
  }
  get orientation(): Orientation {
    return this.placement.orientation;
  }
  get origin(): Coord {
    return this.placement.origin;
  }

  contains(c: Coord): boolean {
    return this.cells.some((cell) => cell.x === c.x && cell.y === c.y);
  }

  isHitAt(c: Coord): boolean {
    return this.hitKeys.has(keyOf(c));
  }

  /** Records a hit; returns false if the cell is not part of the ship or was already hit. */
  registerHit(c: Coord): boolean {
    if (!this.contains(c) || this.isHitAt(c)) return false;
    this.hitKeys.add(keyOf(c));
    return true;
  }

  get hitCount(): number {
    return this.hitKeys.size;
  }

  get isSunk(): boolean {
    return this.hitKeys.size >= this.length;
  }
}
