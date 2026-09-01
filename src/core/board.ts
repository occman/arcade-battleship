import { FLEET, GRID_SIZE, type ShipId, type ShipSpec } from './constants.ts';
import { inBounds, keyOf, segmentCells, type Coord } from './coord.ts';
import { Ship, type Placement } from './ship.ts';

export type CellMark = 'hit' | 'miss';
export type ShotOutcome = 'hit' | 'miss' | 'repeat' | 'invalid';

export interface ShotResult {
  readonly outcome: ShotOutcome;
  readonly coord: Coord;
  /** The ship that was hit, if any. */
  readonly ship?: Ship;
  /** The ship sunk by this shot, if any. */
  readonly sunk?: Ship;
  /** True when this shot sank the last remaining ship. */
  readonly fleetDestroyed: boolean;
}

/** One player's ocean: their ships plus every shot the opponent has fired at it. */
export class Board {
  readonly size: number = GRID_SIZE;
  private readonly shipList: Ship[] = [];
  private readonly occupancy = new Map<number, Ship>();
  private readonly marks = new Map<number, CellMark>();

  get ships(): readonly Ship[] {
    return this.shipList;
  }

  getShip(id: ShipId): Ship | undefined {
    return this.shipList.find((s) => s.id === id);
  }

  shipAt(c: Coord): Ship | undefined {
    return this.occupancy.get(keyOf(c));
  }

  markAt(c: Coord): CellMark | undefined {
    return this.marks.get(keyOf(c));
  }

  get shotMarks(): ReadonlyMap<number, CellMark> {
    return this.marks;
  }

  /** Ships may touch but not overlap, and must lie fully inside the grid. */
  canPlace(spec: ShipSpec, placement: Placement): boolean {
    return segmentCells(placement.origin, spec.length, placement.orientation).every(
      (c) => inBounds(c.x, c.y, this.size) && !this.occupancy.has(keyOf(c)),
    );
  }

  place(spec: ShipSpec, placement: Placement): Ship {
    if (this.getShip(spec.id)) throw new Error(`${spec.name} is already placed`);
    if (!this.canPlace(spec, placement)) throw new Error(`Invalid placement for ${spec.name}`);
    const ship = new Ship(spec, placement);
    for (const c of ship.cells) this.occupancy.set(keyOf(c), ship);
    this.shipList.push(ship);
    return ship;
  }

  remove(id: ShipId): Ship | undefined {
    const index = this.shipList.findIndex((s) => s.id === id);
    if (index === -1) return undefined;
    const [ship] = this.shipList.splice(index, 1);
    if (ship) for (const c of ship.cells) this.occupancy.delete(keyOf(c));
    return ship;
  }

  clear(): void {
    this.shipList.length = 0;
    this.occupancy.clear();
    this.marks.clear();
  }

  get isFleetComplete(): boolean {
    return FLEET.every((spec) => this.getShip(spec.id) !== undefined);
  }

  get remainingShips(): Ship[] {
    return this.shipList.filter((s) => !s.isSunk);
  }

  get allSunk(): boolean {
    return this.shipList.length > 0 && this.shipList.every((s) => s.isSunk);
  }

  get shotCount(): number {
    return this.marks.size;
  }

  get hitCount(): number {
    let n = 0;
    for (const mark of this.marks.values()) if (mark === 'hit') n++;
    return n;
  }

  fire(coord: Coord): ShotResult {
    if (!inBounds(coord.x, coord.y, this.size)) return { outcome: 'invalid', coord, fleetDestroyed: false };
    const k = keyOf(coord);
    if (this.marks.has(k)) return { outcome: 'repeat', coord, fleetDestroyed: this.allSunk };

    const ship = this.occupancy.get(k);
    if (!ship) {
      this.marks.set(k, 'miss');
      return { outcome: 'miss', coord, fleetDestroyed: false };
    }
    this.marks.set(k, 'hit');
    ship.registerHit(coord);
    const sunk = ship.isSunk ? ship : undefined;
    return { outcome: 'hit', coord, ship, sunk, fleetDestroyed: this.allSunk };
  }
}
