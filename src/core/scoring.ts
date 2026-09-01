import { difficultySpec, type Difficulty } from './constants.ts';

/** All tunable score constants live here. */
export const SCORE = {
  hit: 100,
  sinkPerLength: 50,
  streakCap: 3,
  accuracyPerPercent: 10,
  efficiencyPerShotSaved: 20,
  totalCells: 100,
} as const;

export interface ScoreState {
  readonly points: number;
  /** Consecutive hits, including the latest shot. */
  readonly streak: number;
}

export const INITIAL_SCORE: ScoreState = { points: 0, streak: 0 };

export interface ScoreDelta {
  readonly state: ScoreState;
  readonly delta: number;
  readonly label: string;
}

export const multiplierFor = (difficulty: Difficulty): number => difficultySpec(difficulty).multiplier;

export function scoreShot(
  state: ScoreState,
  outcome: 'hit' | 'miss',
  sunkLength: number | undefined,
  multiplier: number,
): ScoreDelta {
  if (outcome === 'miss') return { state: { points: state.points, streak: 0 }, delta: 0, label: 'MISS' };
  const streak = Math.min(state.streak + 1, SCORE.streakCap);
  let raw = SCORE.hit * streak;
  let label = streak > 1 ? `HIT x${streak}` : 'HIT';
  if (sunkLength !== undefined) {
    raw += SCORE.sinkPerLength * sunkLength;
    label = 'SUNK';
  }
  const delta = Math.round(raw * multiplier);
  return { state: { points: state.points + delta, streak: Math.min(state.streak + 1, SCORE.streakCap) }, delta, label };
}

export interface EndBonus {
  readonly accuracy: number;
  readonly efficiency: number;
  readonly total: number;
}

/** Bonuses awarded on victory only. */
export function endBonus(shots: number, hits: number, won: boolean, multiplier: number): EndBonus {
  if (!won || shots === 0) return { accuracy: 0, efficiency: 0, total: 0 };
  const accuracyPct = Math.round((hits / shots) * 100);
  const accuracy = Math.round(accuracyPct * SCORE.accuracyPerPercent * multiplier);
  const efficiency = Math.round(Math.max(0, SCORE.totalCells - shots) * SCORE.efficiencyPerShotSaved * multiplier);
  return { accuracy, efficiency, total: accuracy + efficiency };
}
