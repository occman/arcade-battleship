import type { Difficulty } from './core/constants.ts';

const SETTINGS_KEY = 'arcade-battleship:settings:v1';
const SCORES_KEY = 'arcade-battleship:scores:v1';
export const TABLE_SIZE = 10;

export interface Settings {
  music: boolean;
}

export interface HighScore {
  readonly initials: string;
  readonly score: number;
  readonly difficulty: Difficulty;
  readonly won: boolean;
  readonly shots: number;
  readonly date: string;
}

export function defaultSettings(): Settings {
  return { music: true };
}

/** Reduced motion is not a user toggle in-game; it follows the OS preference. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota: settings simply won't persist.
  }
}

export function loadSettings(): Settings {
  return { ...defaultSettings(), ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function loadScores(): HighScore[] {
  const list = read<HighScore[]>(SCORES_KEY);
  return Array.isArray(list) ? list.slice(0, TABLE_SIZE) : [];
}

export function saveScores(list: readonly HighScore[]): void {
  write(SCORES_KEY, list.slice(0, TABLE_SIZE));
}

export function qualifies(score: number, list: readonly HighScore[]): boolean {
  if (score <= 0) return false;
  if (list.length < TABLE_SIZE) return true;
  return score > (list[list.length - 1]?.score ?? 0);
}

/** Inserts keeping the table sorted; returns the new table and the 0-based rank (or -1). */
export function insertScore(list: readonly HighScore[], entry: HighScore): { list: HighScore[]; rank: number } {
  const next = [...list, entry].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, TABLE_SIZE);
  return { list: next, rank: next.indexOf(entry) };
}
