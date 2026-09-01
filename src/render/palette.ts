import type { ShipId } from '../core/constants.ts';

/** 80s neon arcade palette. Mirrored as CSS variables in styles/theme.css. */
export const PALETTE = {
  bg: '#050014',
  water: '#070b2a',
  waterLight: '#0d1746',
  grid: '#1b2a6b',
  gridBright: '#2c4bb8',
  label: '#7f8cff',
  cyan: '#00f0ff',
  magenta: '#ff00e6',
  yellow: '#ffe600',
  green: '#39ff14',
  orange: '#ff6a00',
  red: '#ff2a4a',
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
  battleship: PALETTE.magenta,
  cruiser: PALETTE.yellow,
  submarine: PALETTE.green,
  destroyer: PALETTE.orange,
};
