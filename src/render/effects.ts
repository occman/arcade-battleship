import type { Coord, Orientation } from '../core/coord.ts';
import type { ShipId } from '../core/constants.ts';
import type { BoardCanvas } from './canvas.ts';
import { clamp01, easeInQuad, easeOutCubic, lerp } from './loop.ts';
import { PALETTE } from './palette.ts';
import { pixelCircle } from './pixel.ts';
import { shipSprite } from './sprites.ts';

/** Global effect intensity; toggled by the Reduce FX setting. */
export const fx = { durationScale: 1, flashes: true, shake: true };

export function setReducedFx(on: boolean): void {
  fx.durationScale = on ? 0.45 : 1;
  fx.flashes = !on;
  fx.shake = !on;
}

const dur = (ms: number): number => ms * fx.durationScale;
const rnd = (min: number, max: number): number => min + Math.random() * (max - min);

export const PIXEL_FONT = '"Press Start 2P", "Courier New", monospace';

export interface Effect {
  /** Advance by dt ms; return false once finished. */
  update(dt: number): boolean;
  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void;
  shakeOffset?(): { x: number; y: number };
}

/** Runs effects for one canvas and resolves promises when they finish. */
export class EffectLayer {
  private items: { effect: Effect; done: () => void }[] = [];

  run(effect: Effect): Promise<void> {
    return new Promise((resolve) => this.items.push({ effect, done: resolve }));
  }

  add(effect: Effect): void {
    this.items.push({ effect, done: () => undefined });
  }

  update(dt: number): void {
    const finished = this.items.filter((i) => !i.effect.update(dt));
    if (finished.length) {
      this.items = this.items.filter((i) => !finished.includes(i));
      for (const f of finished) f.done();
    }
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    for (const { effect } of this.items) effect.draw(ctx, bc);
  }

  shake(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const { effect } of this.items) {
      const o = effect.shakeOffset?.();
      if (o) {
        x += o.x;
        y += o.y;
      }
    }
    return { x, y };
  }

  get busy(): boolean {
    return this.items.length > 0;
  }

  clear(): void {
    const items = this.items;
    this.items = [];
    for (const i of items) i.done();
  }
}

abstract class Timed implements Effect {
  protected elapsed = 0;
  protected readonly duration: number;

  constructor(durationMs: number) {
    this.duration = Math.max(1, dur(durationMs));
  }

  protected get t(): number {
    return clamp01(this.elapsed / this.duration);
  }

  update(dt: number): boolean {
    this.elapsed += dt;
    return this.elapsed < this.duration;
  }

  abstract draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

function stepParticles(ps: Particle[], dt: number, gravity: number): void {
  const s = dt / 1000;
  for (const p of ps) {
    p.x += p.vx * s;
    p.y += p.vy * s;
    p.vy += gravity * s;
    p.life -= dt;
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[], px: number): void {
  for (const p of ps) {
    if (p.life <= 0) continue;
    ctx.globalAlpha = clamp01(p.life / p.maxLife);
    ctx.fillStyle = p.color;
    const size = Math.max(px, Math.round(p.size / px) * px);
    ctx.fillRect(Math.round(p.x / px) * px, Math.round(p.y / px) * px, size, size);
  }
  ctx.globalAlpha = 1;
}

/** A shell arcs in from off-canvas and lands on the target cell. */
export class ShellFlight extends Timed {
  private readonly target: Coord;
  private readonly from: 'top' | 'bottom';
  private readonly trail: { x: number; y: number }[] = [];
  private readonly spread = rnd(-1.5, 1.5);

  constructor(target: Coord, from: 'top' | 'bottom', durationMs = 350) {
    super(durationMs);
    this.target = target;
    this.from = from;
  }

  private position(bc: BoardCanvas, t: number): { x: number; y: number } {
    const end = bc.cellCenter(this.target.x, this.target.y);
    const startY = this.from === 'bottom' ? bc.height + bc.cell : -bc.cell;
    const startX = end.px + this.spread * bc.cell;
    const e = easeInQuad(t);
    return {
      x: lerp(startX, end.px, e),
      y: lerp(startY, end.py, e) - Math.sin(Math.PI * t) * bc.cell * 1.2,
    };
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    const px = bc.artPx;
    const p = this.position(bc, this.t);
    this.trail.push(p);
    if (this.trail.length > 6) this.trail.shift();
    this.trail.forEach((q, i) => {
      ctx.globalAlpha = (i + 1) / this.trail.length / 2;
      ctx.fillStyle = PALETTE.orange;
      ctx.fillRect(Math.round(q.x / px) * px - px, Math.round(q.y / px) * px - px, px * 2, px * 2);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillRect(Math.round(p.x / px) * px - px, Math.round(p.y / px) * px - px, px * 2, px * 2);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(Math.round(p.x / px) * px, Math.round(p.y / px) * px, px, px);
  }
}

/** Fireball, expanding ring, sparks and smoke. */
export class Explosion extends Timed {
  private readonly cell: Coord;
  private readonly scale: number;
  private sparks: Particle[] = [];
  private smoke: Particle[] = [];
  private spawned = false;

  constructor(cell: Coord, scale = 1, durationMs = 600) {
    super(durationMs);
    this.cell = cell;
    this.scale = scale;
  }

  override update(dt: number): boolean {
    stepParticles(this.sparks, dt, 900);
    stepParticles(this.smoke, dt, -60);
    return super.update(dt);
  }

  private spawn(bc: BoardCanvas): void {
    this.spawned = true;
    const c = bc.cellCenter(this.cell.x, this.cell.y);
    const speed = bc.cell * 4 * this.scale;
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(0.3, 1) * speed;
      this.sparks.push({
        x: c.px,
        y: c.py,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.3,
        life: rnd(250, 650),
        maxLife: 650,
        color: [PALETTE.yellow, PALETTE.orange, PALETTE.white][i % 3] as string,
        size: bc.artPx * (i % 2 ? 1 : 2),
      });
    }
    for (let i = 0; i < 7; i++) {
      this.smoke.push({
        x: c.px + rnd(-0.3, 0.3) * bc.cell,
        y: c.py + rnd(-0.2, 0.2) * bc.cell,
        vx: rnd(-0.2, 0.2) * bc.cell,
        vy: rnd(-0.9, -0.4) * bc.cell,
        life: rnd(500, 800),
        maxLife: 800,
        color: PALETTE.smoke,
        size: bc.artPx * 2,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    if (!this.spawned) this.spawn(bc);
    const t = this.t;
    const c = bc.cellCenter(this.cell.x, this.cell.y);
    const px = bc.artPx;
    const size = bc.cell * this.scale;
    if (t > 0.45) drawParticles(ctx, this.smoke, px);
    if (t < 0.8) {
      const ring = lerp(0.15, 1.05, easeOutCubic(t / 0.8)) * size;
      ctx.globalAlpha = 1 - t / 0.8;
      pixelCircle(ctx, c.px, c.py, ring, px, PALETTE.orange, Math.max(px, size * 0.2));
      ctx.globalAlpha = 1;
    }
    if (t < 0.4) {
      const core = lerp(0.1, 0.6, easeOutCubic(t / 0.4)) * size;
      pixelCircle(ctx, c.px, c.py, core, px, t < 0.15 ? PALETTE.white : PALETTE.yellow);
      if (t > 0.15) pixelCircle(ctx, c.px, c.py, core * 0.45, px, PALETTE.white);
    }
    drawParticles(ctx, this.sparks, px);
  }
}

/** Rings and droplets for a miss. */
export class Splash extends Timed {
  private readonly cell: Coord;
  private drops: Particle[] = [];
  private spawned = false;

  constructor(cell: Coord, durationMs = 480) {
    super(durationMs);
    this.cell = cell;
  }

  override update(dt: number): boolean {
    stepParticles(this.drops, dt, 700);
    return super.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    const c = bc.cellCenter(this.cell.x, this.cell.y);
    const px = bc.artPx;
    if (!this.spawned) {
      this.spawned = true;
      for (let i = 0; i < 9; i++) {
        this.drops.push({
          x: c.px + rnd(-0.15, 0.15) * bc.cell,
          y: c.py,
          vx: rnd(-1, 1) * bc.cell,
          vy: rnd(-2.6, -1.4) * bc.cell,
          life: rnd(280, 460),
          maxLife: 460,
          color: i % 3 === 0 ? PALETTE.white : PALETTE.cyan,
          size: px,
        });
      }
    }
    const t = this.t;
    for (const [delay, color] of [
      [0, PALETTE.white],
      [0.2, PALETTE.cyan],
    ] as const) {
      const local = clamp01((t - delay) / (1 - delay));
      if (local <= 0) continue;
      ctx.globalAlpha = 1 - local;
      pixelCircle(ctx, c.px, c.py, lerp(0.1, 0.8, easeOutCubic(local)) * bc.cell, px, color, px);
    }
    ctx.globalAlpha = 1;
    drawParticles(ctx, this.drops, px);
  }
}

/** Brief full-canvas tint. Skipped entirely under Reduce FX. */
export class Flash extends Timed {
  private readonly color: string;
  private readonly peak: number;

  constructor(color: string, peak = 0.35, durationMs = 140) {
    super(fx.flashes ? durationMs : 1);
    this.color = color;
    this.peak = peak;
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    if (!fx.flashes) return;
    ctx.globalAlpha = this.peak * (1 - this.t);
    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, bc.width, bc.height);
    ctx.globalAlpha = 1;
  }
}

/** Camera shake; the renderer applies the offset before drawing everything. */
export class Shake extends Timed {
  private readonly amplitude: number;

  constructor(amplitudePx: number, durationMs = 320) {
    super(durationMs);
    this.amplitude = fx.shake ? amplitudePx : 0;
  }

  shakeOffset(): { x: number; y: number } {
    const a = this.amplitude * (1 - this.t);
    return { x: rnd(-a, a), y: rnd(-a, a) };
  }

  draw(): void {
    // nothing to draw
  }
}

/** Score / message text rising from a cell. */
export class FloatingText extends Timed {
  private readonly cell: Coord;
  private readonly text: string;
  private readonly color: string;

  constructor(cell: Coord, text: string, color: string, durationMs = 950) {
    super(durationMs);
    this.cell = cell;
    this.text = text;
    this.color = color;
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    const c = bc.cellCenter(this.cell.x, this.cell.y);
    const t = this.t;
    const y = c.py - bc.cell * 0.2 - easeOutCubic(t) * bc.cell * 0.9;
    ctx.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
    ctx.font = `${Math.max(8, Math.round(bc.cell * 0.28))}px ${PIXEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(this.text, Math.round(c.px), Math.round(y));
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, Math.round(c.px), Math.round(y));
    ctx.globalAlpha = 1;
  }
}

/** The AI's targeting reticle sweeping onto its chosen cell, then locking on. */
export class Reticle extends Timed {
  private readonly target: Coord;
  private readonly start: Coord;
  private readonly sweep: number;
  private readonly onTick: (() => void) | undefined;
  private lastTick = 0;

  constructor(target: Coord, onTick?: () => void, sweepMs = 650, holdMs = 220) {
    super(sweepMs + holdMs);
    this.target = target;
    this.sweep = dur(sweepMs);
    this.onTick = onTick;
    this.start = { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 10) };
  }

  override update(dt: number): boolean {
    const alive = super.update(dt);
    if (this.elapsed < this.sweep && this.elapsed - this.lastTick > dur(90)) {
      this.lastTick = this.elapsed;
      this.onTick?.();
    }
    return alive;
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    const px = bc.artPx;
    const s = clamp01(this.elapsed / this.sweep);
    const e = easeOutCubic(s);
    const a = bc.cellCenter(this.start.x, this.start.y);
    const b = bc.cellCenter(this.target.x, this.target.y);
    const x = Math.round(lerp(a.px, b.px, e) / px) * px;
    const y = Math.round(lerp(a.py, b.py, e) / px) * px;
    const locked = s >= 1;
    const blink = locked && Math.floor((this.elapsed - this.sweep) / dur(70)) % 2 === 0;
    ctx.fillStyle = locked ? (blink ? PALETTE.white : PALETTE.red) : PALETTE.magenta;
    const half = bc.cell / 2 + (locked ? 0 : (1 - e) * bc.cell);
    const arm = Math.max(px * 2, bc.cell * 0.3);
    // Corner brackets.
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const cx = x + sx * half;
      const cy = y + sy * half;
      ctx.fillRect(sx < 0 ? cx : cx - arm, cy - (sy < 0 ? 0 : px), arm, px);
      ctx.fillRect(cx - (sx < 0 ? 0 : px), sy < 0 ? cy : cy - arm, px, arm);
    }
    // Centre dot and cross ticks.
    ctx.fillRect(x - px / 2, y - px / 2, px, px);
    ctx.fillRect(x - half, y - px / 2, arm, px);
    ctx.fillRect(x + half - arm, y - px / 2, arm, px);
    ctx.fillRect(x - px / 2, y - half, px, arm);
    ctx.fillRect(x - px / 2, y + half - arm, px, arm);
  }
}

export interface SinkTarget {
  readonly id: ShipId;
  readonly origin: Coord;
  readonly orientation: Orientation;
  readonly length: number;
}

/** Ship flashes red, then tilts and slides under with a stream of bubbles. */
export class SinkCinematic extends Timed {
  private readonly ship: SinkTarget;
  private bubbles: Particle[] = [];
  private spawned = false;

  constructor(ship: SinkTarget, durationMs = 1400) {
    super(durationMs);
    this.ship = ship;
  }

  override update(dt: number): boolean {
    stepParticles(this.bubbles, dt, -40);
    return super.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D, bc: BoardCanvas): void {
    const { id, origin, orientation, length } = this.ship;
    const o = bc.cellOrigin(origin.x, origin.y);
    const w = orientation === 'h' ? length * bc.cell : bc.cell;
    const h = orientation === 'h' ? bc.cell : length * bc.cell;
    const px = bc.artPx;
    if (!this.spawned) {
      this.spawned = true;
      for (let i = 0; i < 18; i++) {
        this.bubbles.push({
          x: o.px + rnd(0.1, 0.9) * w,
          y: o.py + rnd(0.3, 0.9) * h,
          vx: rnd(-0.15, 0.15) * bc.cell,
          vy: rnd(-0.8, -0.3) * bc.cell,
          life: rnd(600, 1000) + i * 30,
          maxLife: 1000,
          color: i % 4 === 0 ? PALETTE.white : PALETTE.cyan,
          size: px,
        });
      }
    }
    const t = this.t;
    const flashPhase = 0.32;
    if (t < flashPhase) {
      const red = Math.floor(this.elapsed / dur(150)) % 2 === 0;
      const sprite = shipSprite(id, orientation, bc.spriteScale, red ? 'sunk' : 'normal');
      ctx.drawImage(sprite, o.px, o.py, w, h);
      if (red) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = PALETTE.red;
        ctx.fillRect(o.px, o.py, w, h);
        ctx.globalAlpha = 1;
      }
      return;
    }
    const s = clamp01((t - flashPhase) / (1 - flashPhase));
    if (t > 0.5) drawParticles(ctx, this.bubbles, px);
    ctx.save();
    ctx.globalAlpha = 1 - easeInQuad(s);
    ctx.translate(o.px + w / 2, o.py + h / 2 + s * bc.cell * 0.5);
    ctx.rotate((orientation === 'h' ? 1 : -1) * s * 0.12);
    ctx.drawImage(shipSprite(id, orientation, bc.spriteScale, 'normal'), -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
