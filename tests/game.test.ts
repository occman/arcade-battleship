import { describe, expect, it } from 'vitest';
import type { AIStrategy, ShotFeedback, ShotView } from '../src/core/ai/types.ts';
import type { Board } from '../src/core/board.ts';
import { FLEET } from '../src/core/constants.ts';
import { allCoords, type Coord } from '../src/core/coord.ts';
import { Game } from '../src/core/game.ts';
import { createRng } from '../src/core/rng.ts';
import { STANDARD_LAYOUT, type Layout } from './helpers.ts';

/** Deterministic opponent: fixed fleet, shoots cells in reading order. */
class ScriptedAI implements AIStrategy {
  readonly id = 'cadet' as const;
  readonly observed: { coord: Coord; feedback: ShotFeedback }[] = [];
  private readonly layout: Layout;
  private readonly queue: Coord[];
  constructor(layout: Layout, shots: Coord[] = allCoords()) {
    this.layout = layout;
    this.queue = [...shots];
  }
  placeFleet(board: Board): void {
    for (const s of FLEET) {
      const p = this.layout[s.id];
      if (p) board.place(s, { origin: { x: p.x, y: p.y }, orientation: p.o });
    }
  }
  chooseShot(view: ShotView): Coord {
    while (this.queue.length) {
      const c = this.queue.shift()!;
      if (view.markAt(c.x, c.y) === undefined) return c;
    }
    throw new Error('out of shots');
  }
  observe(coord: Coord, feedback: ShotFeedback): void {
    this.observed.push({ coord, feedback });
  }
}

function readyGame(shots?: Coord[]) {
  const ai = new ScriptedAI(STANDARD_LAYOUT, shots);
  const game = new Game({ difficulty: 'captain', ai, rng: createRng(1) });
  for (const s of FLEET) {
    const p = STANDARD_LAYOUT[s.id]!;
    game.placeShip(s.id, { origin: { x: p.x, y: p.y }, orientation: p.o });
  }
  return { game, ai };
}

describe('Game placement phase', () => {
  it('starts in placement and refuses battle actions', () => {
    const game = new Game({ difficulty: 'cadet', ai: new ScriptedAI(STANDARD_LAYOUT), rng: createRng(1) });
    expect(game.phase).toBe('placement');
    expect(game.canStartBattle).toBe(false);
    expect(() => game.fire({ x: 0, y: 0 })).toThrow(/phase/);
    expect(() => game.startBattle()).toThrow(/Place all ships/);
  });

  it('places, removes and randomises the human fleet', () => {
    const game = new Game({ difficulty: 'cadet', ai: new ScriptedAI(STANDARD_LAYOUT), rng: createRng(7) });
    expect(game.canPlaceShip('carrier', { origin: { x: 0, y: 0 }, orientation: 'h' })).toBe(true);
    game.placeShip('carrier', { origin: { x: 0, y: 0 }, orientation: 'h' });
    expect(game.canPlaceShip('destroyer', { origin: { x: 0, y: 0 }, orientation: 'v' })).toBe(false);
    expect(game.removeShip('carrier')?.id).toBe('carrier');
    game.randomizeFleet();
    expect(game.boards.human.isFleetComplete).toBe(true);
    game.clearFleet();
    expect(game.boards.human.ships).toHaveLength(0);
  });

  it('moves to battle with the AI fleet placed and the human to shoot first', () => {
    const { game } = readyGame();
    const phases: string[] = [];
    game.events.on('phase', (e) => phases.push(e.phase));
    expect(game.canStartBattle).toBe(true);
    game.startBattle();
    expect(phases).toEqual(['battle']);
    expect(game.phase).toBe('battle');
    expect(game.turn).toBe('human');
    expect(game.boards.ai.isFleetComplete).toBe(true);
    expect(() => game.placeShip('carrier', { origin: { x: 0, y: 0 }, orientation: 'h' })).toThrow(/phase/);
  });
});

describe('Game battle phase', () => {
  it('passes the turn after a hit and after a miss, but not after a repeat', () => {
    const { game } = readyGame();
    game.startBattle();
    expect(game.fire({ x: 0, y: 0 }).outcome).toBe('hit');
    expect(game.turn).toBe('ai');
    expect(() => game.fire({ x: 1, y: 0 })).toThrow(/Not your turn/);
    game.aiFire();
    expect(game.turn).toBe('human');
    expect(game.fire({ x: 0, y: 0 }).outcome).toBe('repeat');
    expect(game.turn).toBe('human');
    expect(game.fire({ x: 9, y: 9 }).outcome).toBe('miss');
    expect(game.turn).toBe('ai');
    expect(game.stats.human).toEqual({ shots: 2, hits: 1, sunk: 0 });
  });

  it('feeds the AI honest feedback and tracks its stats', () => {
    const { game, ai } = readyGame([{ x: 0, y: 8 }, { x: 1, y: 8 }, { x: 5, y: 9 }]);
    game.startBattle();
    game.fire({ x: 9, y: 9 });
    expect(game.aiFire().outcome).toBe('hit');
    game.fire({ x: 9, y: 8 });
    const second = game.aiFire();
    expect(second.sunk?.id).toBe('destroyer');
    expect(ai.observed[1]?.feedback).toEqual({ outcome: 'hit', sunk: { name: 'Destroyer', length: 2 } });
    game.fire({ x: 9, y: 7 });
    expect(game.aiFire().outcome).toBe('miss');
    expect(ai.observed[2]?.feedback).toEqual({ outcome: 'miss', sunk: undefined });
    expect(game.stats.ai).toEqual({ shots: 3, hits: 2, sunk: 1 });
    expect(game.stats.turns).toBe(3);
  });

  it('scores hits, streaks and sinks with the tier multiplier', () => {
    const { game } = readyGame();
    game.startBattle();
    const scores: number[] = [];
    game.events.on('score', (e) => scores.push(e.delta));
    game.fire({ x: 0, y: 8 }); // hit x1 -> 100 * 2
    game.aiFire();
    game.fire({ x: 1, y: 8 }); // hit x2 + destroyer sink (2*50) -> 300 * 2
    expect(scores).toEqual([200, 600]);
    expect(game.score).toBe(800);
  });

  it('ends when the human sinks every ship, with end bonuses', () => {
    const { game } = readyGame();
    game.startBattle();
    const events: string[] = [];
    game.events.on('sunk', (e) => events.push(`sunk:${e.by}:${e.ship.id}`));
    game.events.on('over', (e) => events.push(`over:${e.winner}`));
    const targets = game.boards.ai.ships.flatMap((s) => s.cells);
    for (const c of targets) {
      game.fire(c);
      if (game.phase === 'battle') game.aiFire();
    }
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('human');
    expect(events.filter((e) => e.startsWith('sunk:human'))).toHaveLength(FLEET.length);
    expect(events.at(-1)).toBe('over:human');
    expect(game.currentBonus().total).toBeGreaterThan(0);
    expect(game.finalScore).toBe(game.score + game.currentBonus().total);
    expect(() => game.fire({ x: 9, y: 9 })).toThrow(/phase/);
  });

  it('ends when the AI sinks every ship, without end bonuses', () => {
    const shots = FLEET.flatMap((s) => {
      const p = STANDARD_LAYOUT[s.id]!;
      return Array.from({ length: s.length }, (_, i) => ({ x: p.x + i, y: p.y }));
    });
    const { game } = readyGame(shots);
    game.startBattle();
    let x = 0;
    while (game.phase === 'battle') {
      game.fire({ x: x % 10, y: 9 - Math.floor(x / 10) }); // human plinks away at empty rows
      x++;
      if (game.phase === 'battle') game.aiFire();
    }
    expect(game.winner).toBe('ai');
    expect(game.currentBonus().total).toBe(0);
    expect(game.stats.ai.sunk).toBe(FLEET.length);
  });

  it('forfeits to the AI mid-battle', () => {
    const { game } = readyGame();
    game.startBattle();
    game.forfeit();
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('ai');
  });
});
