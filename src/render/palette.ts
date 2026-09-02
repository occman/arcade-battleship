import type { ShipId } from '../core/constants.ts';

/**
 * Naval arcade palette: deep navy ocean, glowing radar cyan, warning amber /
 * orange for fire and the logo, signal red for alerts. Mirrored as CSS
 * variables in styles/theme.css.
 */
export const PALETTE = {
  bg: '#020b1c',
  water: '#04203f',
  waterLight: '#062c55',
  grid: '#0c4a80',
  gridBright: '#1a8fd6',
  label: '#6fd3ff',
  cyan: '#3ee0ff',
  amber: '#ffb000',
  orange: '#ff7a00',
  red: '#ff2f3a',
  green: '#39ff14',
  white: '#ffffff',
  hull: '#9aa3b8',
  hullDark: '#3a4256',
  hullLight: '#dfe6f5',
  sunkHull: '#5a1f2e',
  sunkDark: '#2a0a12',
  sunkLight: '#8a2f42',
  ember: '#7a1020',
  smoke: '#3a3a4a',
} as const;

export const SHIP_ACCENT: Record<ShipId, string> = {
  carrier: PALETTE.cyan,
  battleship: PALETTE.red,
  cruiser: PALETTE.amber,
  submarine: PALETTE.green,
  destroyer: '#c8d8ff',
};
