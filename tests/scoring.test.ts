import { describe, expect, it } from 'vitest';
import { endBonus, INITIAL_SCORE, multiplierFor, SCORE, scoreShot } from '../src/core/scoring.ts';

describe('scoring', () => {
  it('awards hits with a capped streak multiplier', () => {
    let s = INITIAL_SCORE;
    const deltas: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = scoreShot(s, 'hit', undefined, 1);
      deltas.push(r.delta);
      s = r.state;
    }
    expect(deltas).toEqual([100, 200, 300, 300, 300]);
    expect(s.points).toBe(1200);
    expect(s.streak).toBe(SCORE.streakCap);
  });

  it('resets the streak on a miss without deducting points', () => {
    const hit = scoreShot(INITIAL_SCORE, 'hit', undefined, 1);
    const miss = scoreShot(hit.state, 'miss', undefined, 1);
    expect(miss.delta).toBe(0);
    expect(miss.state).toEqual({ points: 100, streak: 0 });
    expect(scoreShot(miss.state, 'hit', undefined, 1).delta).toBe(100);
  });

  it('adds a sink bonus proportional to ship length', () => {
    const r = scoreShot(INITIAL_SCORE, 'hit', 5, 1);
    expect(r.delta).toBe(SCORE.hit + SCORE.sinkPerLength * 5);
    expect(r.label).toBe('SUNK');
  });

  it('applies the difficulty multiplier to every delta', () => {
    expect(scoreShot(INITIAL_SCORE, 'hit', undefined, 1.5).delta).toBe(150);
    expect(scoreShot(INITIAL_SCORE, 'hit', 2, 3).delta).toBe((100 + 100) * 3);
    expect(multiplierFor('cadet')).toBe(1);
    expect(multiplierFor('admiral')).toBe(3);
  });

  it('grants end bonuses only on victory', () => {
    expect(endBonus(45, 17, false, 2).total).toBe(0);
    const bonus = endBonus(45, 17, true, 2);
    expect(bonus.accuracy).toBe(Math.round(38 * 10 * 2));
    expect(bonus.efficiency).toBe(55 * 20 * 2);
    expect(bonus.total).toBe(bonus.accuracy + bonus.efficiency);
    expect(endBonus(100, 17, true, 1).efficiency).toBe(0);
  });
});
