import { coordKey, fromKey, inBounds, keyOf, neighbors4, type Coord } from '../coord.ts';
import type { Rng } from '../rng.ts';
import { isUntried, untriedCells } from './common.ts';
import type { ShotFeedback, ShotView } from './types.ts';

export interface DensityOptions {
  /** While unsunk hits exist, only consider placements that cover them. */
  readonly strictTargeting: boolean;
  /** Extra weight per open hit a placement covers. */
  readonly hitBonus: number;
  /** Enumerate every consistent sunk-ship attribution instead of committing to the first. */
  readonly exactAttribution: boolean;
  /** In hunt mode pick randomly among the top-K cells (1 = always the best). */
  readonly huntTopK: number;
  /** In target mode accept any cell scoring at least this fraction of the best (1 = exact best). */
  readonly targetSlack: number;
}

interface SinkEvent {
  readonly killKey: number;
  readonly length: number;
  readonly time: number;
}

/**
 * Probability-density targeting shared by Captain and Admiral.
 *
 * For every unsunk enemy ship length we count the placements consistent with
 * what we know (no misses, no cells belonging to sunk ships) and pile weight on
 * the untried cells they cover. Placements that overlap unsunk hits are worth
 * more, so "target mode" falls out naturally.
 *
 * Sunk ships are attributed to hit segments using the killing shot and the hit
 * order, which lets the brain cope with touching ships.
 */
export class DensityBrain {
  private time = 0;
  private readonly hitTime = new Map<number, number>();
  private readonly misses = new Set<number>();
  private readonly sinks: SinkEvent[] = [];

  observe(coord: Coord, feedback: ShotFeedback): void {
    this.time++;
    const k = keyOf(coord);
    if (feedback.outcome === 'miss') {
      this.misses.add(k);
      return;
    }
    this.hitTime.set(k, this.time);
    if (feedback.sunk) this.sinks.push({ killKey: k, length: feedback.sunk.length, time: this.time });
  }

  chooseShot(view: ShotView, rng: Rng, opts: DensityOptions): Coord {
    const attributions = this.attributions(opts.exactAttribution ? 64 : 1);
    const n = view.size;
    const weights = new Float64Array(n * n);
    let targeting = false;
    for (const sunkCells of attributions.length ? attributions : [new Set<number>()]) {
      const { weights: w, openHitCount } = this.density(view, sunkCells, opts);
      if (openHitCount > 0) targeting = true;
      for (let i = 0; i < weights.length; i++) weights[i] = (weights[i] ?? 0) + (w[i] ?? 0);
    }

    const cells = untriedCells(view);
    let max = 0;
    for (const c of cells) max = Math.max(max, weights[coordKey(c.x, c.y)] ?? 0);
    if (max <= 0) return this.fallback(view, rng);

    if (targeting) {
      const threshold = max * Math.min(1, Math.max(0, opts.targetSlack));
      return rng.pick(cells.filter((c) => (weights[coordKey(c.x, c.y)] ?? 0) >= threshold));
    }
    if (opts.huntTopK <= 1) return rng.pick(cells.filter((c) => (weights[coordKey(c.x, c.y)] ?? 0) === max));
    const ranked = [...cells].sort((a, b) => (weights[keyOf(b)] ?? 0) - (weights[keyOf(a)] ?? 0));
    return rng.pick(ranked.slice(0, Math.min(opts.huntTopK, ranked.length)));
  }

  /** Cells believed to belong to sunk ships under the first consistent attribution. */
  sunkCellsGuess(): Set<number> {
    return this.attributions(1)[0] ?? new Set<number>();
  }

  /**
   * Every way of assigning each sunk ship to a straight run of cells that were
   * all hit by the time it sank, pairwise disjoint. Usually exactly one.
   */
  attributions(limit = 64): Set<number>[] {
    const results: Set<number>[] = [];
    const used = new Set<number>();
    const recurse = (i: number): void => {
      if (results.length >= limit) return;
      if (i === this.sinks.length) {
        results.push(new Set(used));
        return;
      }
      const sink = this.sinks[i] as SinkEvent;
      const kill = fromKey(sink.killKey);
      let found = false;
      for (const orientation of ['h', 'v'] as const) {
        for (let offset = 0; offset < sink.length; offset++) {
          const keys: number[] = [];
          let ok = true;
          for (let j = 0; j < sink.length; j++) {
            const x = orientation === 'h' ? kill.x - offset + j : kill.x;
            const y = orientation === 'v' ? kill.y - offset + j : kill.y;
            const k = coordKey(x, y);
            if (!inBounds(x, y) || (this.hitTime.get(k) ?? Infinity) > sink.time || used.has(k)) {
              ok = false;
              break;
            }
            keys.push(k);
          }
          if (!ok) continue;
          found = true;
          for (const k of keys) used.add(k);
          recurse(i + 1);
          for (const k of keys) used.delete(k);
        }
      }
      if (!found) recurse(i + 1);
    };
    recurse(0);
    return results;
  }

  private density(view: ShotView, sunkCells: Set<number>, opts: DensityOptions): { weights: Float64Array; openHitCount: number } {
    const n = view.size;
    const weights = new Float64Array(n * n);
    const openHits = new Set<number>();
    for (const k of this.hitTime.keys()) if (!sunkCells.has(k)) openHits.add(k);

    for (const length of view.remainingLengths) {
      for (const orientation of ['h', 'v'] as const) {
        const maxX = orientation === 'h' ? n - length : n - 1;
        const maxY = orientation === 'v' ? n - length : n - 1;
        for (let y = 0; y <= maxY; y++) {
          for (let x = 0; x <= maxX; x++) {
            let covered = 0;
            let ok = true;
            const keys: number[] = [];
            for (let i = 0; i < length; i++) {
              const k = coordKey(orientation === 'h' ? x + i : x, orientation === 'v' ? y + i : y);
              if (this.misses.has(k) || sunkCells.has(k)) {
                ok = false;
                break;
              }
              if (openHits.has(k)) covered++;
              keys.push(k);
            }
            if (!ok) continue;
            if (opts.strictTargeting && openHits.size > 0 && covered === 0) continue;
            const w = 1 + opts.hitBonus * covered;
            for (const k of keys) if (!this.hitTime.has(k)) weights[k] = (weights[k] ?? 0) + w;
          }
        }
      }
    }
    return { weights, openHitCount: openHits.size };
  }

  /** Used only if our model has become inconsistent: probe around open hits, else anywhere. */
  private fallback(view: ShotView, rng: Rng): Coord {
    const sunk = this.sunkCellsGuess();
    const around: Coord[] = [];
    for (const k of this.hitTime.keys()) {
      if (sunk.has(k)) continue;
      for (const c of neighbors4(fromKey(k), view.size)) {
        if (isUntried(view, c.x, c.y) && !around.some((a) => a.x === c.x && a.y === c.y)) around.push(c);
      }
    }
    return around.length ? rng.pick(around) : rng.pick(untriedCells(view));
  }
}
