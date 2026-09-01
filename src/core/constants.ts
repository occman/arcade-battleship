export const GRID_SIZE = 10;

export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

export interface ShipSpec {
  readonly id: ShipId;
  readonly name: string;
  readonly length: number;
}

/** Classic Hasbro fleet. */
export const FLEET: readonly ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
];

export function shipSpec(id: ShipId): ShipSpec {
  const spec = FLEET.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown ship ${id}`);
  return spec;
}

export type Difficulty = 'cadet' | 'lieutenant' | 'captain' | 'admiral';

export interface DifficultySpec {
  readonly id: Difficulty;
  readonly rank: string;
  readonly blurb: string;
  readonly multiplier: number;
}

export const DIFFICULTIES: readonly DifficultySpec[] = [
  { id: 'cadet', rank: 'CADET', blurb: 'Fires at random. A warm-up cruise.', multiplier: 1 },
  { id: 'lieutenant', rank: 'LIEUTENANT', blurb: 'Sweeps in patterns and follows up every hit.', multiplier: 1.5 },
  { id: 'captain', rank: 'CAPTAIN', blurb: 'Calculates where your ships are most likely to be.', multiplier: 2 },
  { id: 'admiral', rank: 'ADMIRAL', blurb: 'Near-perfect targeting and a fleet hidden with care.', multiplier: 3 },
];

export function difficultySpec(id: Difficulty): DifficultySpec {
  const spec = DIFFICULTIES.find((d) => d.id === id);
  if (!spec) throw new Error(`Unknown difficulty ${id}`);
  return spec;
}
