import type { Board } from '../board.ts';
import { neighbors4, sameCoord, type Coord, type Orientation } from '../coord.ts';
import type { Rng } from '../rng.ts';
import { isUntried, untriedCells } from './common.ts';
import { placeRandomFleet } from './placement.ts';
import type { AIStrategy, ShotFeedback, ShotView } from './types.ts';

/**
 * Medium: classic hunt/target. Hunts (optionally on a checkerboard), probes the
 * neighbours of a hit, and once two hits line up it extends the line from both
 * ends. Forgets about a hit cluster when a ship sinks there, which makes
 * touching ships its blind spot.
 */
export interface LieutenantOptions {
  /** Hunt on a checkerboard instead of uniformly at random. */
  readonly parityHunt: boolean;
  /** Extend a line of hits from its ends instead of probing all neighbours. */
  readonly lineTargeting: boolean;
}

/**
 * Tuned so the Lieutenant averages ~61 shots against random fleets: a competent
 * finisher that hunts like a casual human. (Parity hunting would drop it to ~53,
 * too close to the Captain.)
 */
export const LIEUTENANT_OPTIONS: LieutenantOptions = { parityHunt: false, lineTargeting: true };

export class LieutenantStrategy implements AIStrategy {
  readonly id = 'lieutenant' as const;
  private readonly rng: Rng;
  private readonly opts: LieutenantOptions;
  private readonly parity: number;
  private openHits: Coord[] = [];

  constructor(rng: Rng, opts: LieutenantOptions = LIEUTENANT_OPTIONS) {
    this.rng = rng;
    this.opts = opts;
    this.parity = rng.int(2);
  }

  placeFleet(board: Board): void {
    placeRandomFleet(board, this.rng);
  }

  chooseShot(view: ShotView): Coord {
    const targets = this.targetCandidates(view);
    if (targets.length) return this.rng.pick(targets);
    if (this.opts.parityHunt) {
      const lattice = untriedCells(view).filter((c) => (c.x + c.y) % 2 === this.parity);
      if (lattice.length) return this.rng.pick(lattice);
    }
    return this.rng.pick(untriedCells(view));
  }

  observe(coord: Coord, feedback: ShotFeedback): void {
    if (feedback.outcome === 'miss') return;
    this.openHits.push(coord);
    if (feedback.sunk) this.forgetSunkRun(coord);
  }

  private targetCandidates(view: ShotView): Coord[] {
    if (this.openHits.length === 0) return [];
    for (const hit of this.opts.lineTargeting ? this.openHits : []) {
      for (const axis of ['h', 'v'] as const) {
        const run = this.hitRun(view, hit, axis);
        if (run.length < 2) continue;
        const ends = this.runEnds(run, axis).filter((c) => isUntried(view, c.x, c.y));
        if (ends.length) return ends;
      }
    }
    const candidates: Coord[] = [];
    for (const hit of this.openHits) {
      for (const n of neighbors4(hit, view.size)) {
        if (isUntried(view, n.x, n.y) && !candidates.some((c) => sameCoord(c, n))) candidates.push(n);
      }
    }
    return candidates;
  }

  /** Contiguous cells marked 'hit' through `from` along an axis. */
  private hitRun(view: ShotView, from: Coord, axis: Orientation): Coord[] {
    const run: Coord[] = [from];
    const step = axis === 'h' ? { x: 1, y: 0 } : { x: 0, y: 1 };
    for (const dir of [1, -1]) {
      let c = { x: from.x + step.x * dir, y: from.y + step.y * dir };
      while (c.x >= 0 && c.y >= 0 && c.x < view.size && c.y < view.size && view.markAt(c.x, c.y) === 'hit') {
        run.push(c);
        c = { x: c.x + step.x * dir, y: c.y + step.y * dir };
      }
    }
    return run;
  }

  private runEnds(run: Coord[], axis: Orientation): Coord[] {
    const values = run.map((c) => (axis === 'h' ? c.x : c.y));
    const lo = Math.min(...values) - 1;
    const hi = Math.max(...values) + 1;
    const fixed = run[0] as Coord;
    return axis === 'h'
      ? [
          { x: lo, y: fixed.y },
          { x: hi, y: fixed.y },
        ]
      : [
          { x: fixed.x, y: lo },
          { x: fixed.x, y: hi },
        ];
  }

  /** Drop the open hits collinear with the killing shot (over-clears when ships touch). */
  private forgetSunkRun(kill: Coord): void {
    const collinear = (axis: Orientation): Coord[] => {
      const run: Coord[] = [kill];
      const step = axis === 'h' ? { x: 1, y: 0 } : { x: 0, y: 1 };
      for (const dir of [1, -1]) {
        let c = { x: kill.x + step.x * dir, y: kill.y + step.y * dir };
        while (this.openHits.some((h) => sameCoord(h, c))) {
          run.push(c);
          c = { x: c.x + step.x * dir, y: c.y + step.y * dir };
        }
      }
      return run;
    };
    const h = collinear('h');
    const v = collinear('v');
    const doomed = h.length >= v.length ? h : v;
    this.openHits = this.openHits.filter((hit) => !doomed.some((d) => sameCoord(d, hit)));
  }
}
