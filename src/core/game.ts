import type { AIStrategy, ShotView } from './ai/types.ts';
import { Board, type ShotResult } from './board.ts';
import { type Difficulty, type ShipId, shipSpec } from './constants.ts';
import type { Coord } from './coord.ts';
import { Emitter } from './events.ts';
import type { Rng } from './rng.ts';
import { viewOfBoard } from './ai/common.ts';
import { placeRandomFleet } from './ai/placement.ts';
import { endBonus, INITIAL_SCORE, multiplierFor, scoreShot, type EndBonus, type ScoreState } from './scoring.ts';
import type { Placement, Ship } from './ship.ts';

export type Phase = 'placement' | 'battle' | 'over';
export type Side = 'human' | 'ai';

export interface SideStats {
  shots: number;
  hits: number;
  sunk: number;
}

export interface GameStats {
  readonly human: SideStats;
  readonly ai: SideStats;
  /** Completed human/AI rounds. */
  turns: number;
  startedAt: number;
  endedAt?: number;
}

export type GameEvents = {
  phase: { phase: Phase };
  turn: { side: Side };
  /** Emitted after every valid shot, before `sunk`/`over`. */
  shot: { by: Side; result: ShotResult };
  sunk: { by: Side; ship: Ship };
  score: { points: number; delta: number; label: string; coord: Coord };
  over: { winner: Side; stats: GameStats; bonus: EndBonus; finalScore: number };
};

export interface GameOptions {
  readonly difficulty: Difficulty;
  readonly ai: AIStrategy;
  readonly rng: Rng;
}

/**
 * The full state machine for one match. Pure logic: no DOM, no timers.
 * `boards.human` is the human's fleet (the AI shoots at it); `boards.ai` is the
 * AI's fleet (the human shoots at it).
 */
export class Game {
  readonly difficulty: Difficulty;
  readonly multiplier: number;
  readonly boards: Readonly<Record<Side, Board>> = { human: new Board(), ai: new Board() };
  readonly events = new Emitter<GameEvents>();
  readonly stats: GameStats = {
    human: { shots: 0, hits: 0, sunk: 0 },
    ai: { shots: 0, hits: 0, sunk: 0 },
    turns: 0,
    startedAt: Date.now(),
  };
  private readonly ai: AIStrategy;
  private readonly rng: Rng;
  private phaseValue: Phase = 'placement';
  private turnValue: Side = 'human';
  private winnerValue: Side | undefined;
  private scoreState: ScoreState = INITIAL_SCORE;

  constructor(options: GameOptions) {
    this.difficulty = options.difficulty;
    this.multiplier = multiplierFor(options.difficulty);
    this.ai = options.ai;
    this.rng = options.rng;
  }

  get phase(): Phase {
    return this.phaseValue;
  }
  get turn(): Side {
    return this.turnValue;
  }
  get winner(): Side | undefined {
    return this.winnerValue;
  }
  get score(): number {
    return this.scoreState.points;
  }
  get streak(): number {
    return this.scoreState.streak;
  }

  // ---- placement phase -------------------------------------------------

  canPlaceShip(id: ShipId, placement: Placement): boolean {
    return this.phaseValue === 'placement' && this.boards.human.canPlace(shipSpec(id), placement);
  }

  placeShip(id: ShipId, placement: Placement): Ship {
    this.assertPhase('placement');
    return this.boards.human.place(shipSpec(id), placement);
  }

  removeShip(id: ShipId): Ship | undefined {
    this.assertPhase('placement');
    return this.boards.human.remove(id);
  }

  randomizeFleet(): void {
    this.assertPhase('placement');
    placeRandomFleet(this.boards.human, this.rng);
  }

  clearFleet(): void {
    this.assertPhase('placement');
    this.boards.human.clear();
  }

  get canStartBattle(): boolean {
    return this.phaseValue === 'placement' && this.boards.human.isFleetComplete;
  }

  startBattle(): void {
    this.assertPhase('placement');
    if (!this.boards.human.isFleetComplete) throw new Error('Place all ships before starting');
    this.ai.placeFleet(this.boards.ai);
    if (!this.boards.ai.isFleetComplete) throw new Error('AI failed to place its fleet');
    this.stats.startedAt = Date.now();
    this.setPhase('battle');
    this.setTurn('human');
  }

  // ---- battle phase ----------------------------------------------------

  /** Human fires at the AI's ocean. */
  fire(coord: Coord): ShotResult {
    this.assertPhase('battle');
    if (this.turnValue !== 'human') throw new Error('Not your turn');
    const result = this.boards.ai.fire(coord);
    if (result.outcome === 'invalid' || result.outcome === 'repeat') return result;
    this.record('human', result);
    const delta = scoreShot(this.scoreState, result.outcome, result.sunk?.length, this.multiplier);
    this.scoreState = delta.state;
    this.events.emit('shot', { by: 'human', result });
    if (delta.delta > 0) this.events.emit('score', { points: delta.state.points, delta: delta.delta, label: delta.label, coord });
    if (result.sunk) this.events.emit('sunk', { by: 'human', ship: result.sunk });
    if (result.fleetDestroyed) this.finish('human');
    else this.setTurn('ai');
    return result;
  }

  /** AI fires at the human's ocean. */
  aiFire(): ShotResult {
    this.assertPhase('battle');
    if (this.turnValue !== 'ai') throw new Error("Not the AI's turn");
    const coord = this.ai.chooseShot(this.viewForAI());
    const result = this.boards.human.fire(coord);
    if (result.outcome !== 'hit' && result.outcome !== 'miss') {
      throw new Error(`AI fired an illegal shot at ${coord.x},${coord.y} (${result.outcome})`);
    }
    this.ai.observe(coord, {
      outcome: result.outcome,
      sunk: result.sunk ? { name: result.sunk.name, length: result.sunk.length } : undefined,
    });
    this.record('ai', result);
    this.stats.turns++;
    this.events.emit('shot', { by: 'ai', result });
    if (result.sunk) this.events.emit('sunk', { by: 'ai', ship: result.sunk });
    if (result.fleetDestroyed) this.finish('ai');
    else this.setTurn('human');
    return result;
  }

  /** Concede the match (e.g. quitting to the menu mid-battle). */
  forfeit(): void {
    if (this.phaseValue === 'battle') this.finish('ai');
  }

  currentBonus(): EndBonus {
    return endBonus(this.stats.human.shots, this.stats.human.hits, this.winnerValue === 'human', this.multiplier);
  }

  get finalScore(): number {
    return this.scoreState.points + this.currentBonus().total;
  }

  // ---- internals -------------------------------------------------------

  private viewForAI(): ShotView {
    return viewOfBoard(this.boards.human);
  }

  private record(side: Side, result: ShotResult): void {
    const s = this.stats[side];
    s.shots++;
    if (result.outcome === 'hit') s.hits++;
    if (result.sunk) s.sunk++;
  }

  private finish(winner: Side): void {
    this.winnerValue = winner;
    this.stats.endedAt = Date.now();
    this.setPhase('over');
    this.events.emit('over', { winner, stats: this.stats, bonus: this.currentBonus(), finalScore: this.finalScore });
  }

  private setPhase(phase: Phase): void {
    this.phaseValue = phase;
    this.events.emit('phase', { phase });
  }

  private setTurn(side: Side): void {
    this.turnValue = side;
    this.events.emit('turn', { side });
  }

  private assertPhase(phase: Phase): void {
    if (this.phaseValue !== phase) throw new Error(`Expected phase ${phase}, got ${this.phaseValue}`);
  }
}
