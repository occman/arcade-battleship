import type { Board } from '../core/board.ts';
import type { ShipId } from '../core/constants.ts';
import { inBounds, type Coord, type Orientation } from '../core/coord.ts';
import type { BoardCanvas } from './canvas.ts';
import { EffectLayer, PIXEL_FONT } from './effects.ts';
import { loop } from './loop.ts';
import { PALETTE } from './palette.ts';
import { makeCanvas } from './pixel.ts';
import { markerSprite, shipSprite } from './sprites.ts';

export interface Ghost {
  readonly id: ShipId;
  readonly origin: Coord;
  readonly orientation: Orientation;
  readonly length: number;
  readonly valid: boolean;
}

export interface BoardRendererOptions {
  /** Draw every ship (own fleet) or only sunk ones (enemy waters). */
  readonly revealShips: boolean;
  readonly hoverColor?: string;
  /** Overlay a slowly rotating radar sweep with range rings. */
  readonly radar?: boolean;
}

/**
 * Draws one board: a cached static layer (water, grid, labels, ships, pegs)
 * that is rebuilt only when marked dirty, plus per-frame overlays (ghost ship,
 * hover, keyboard cursor) and the board's effect layer.
 */
export class BoardRenderer {
  readonly bc: BoardCanvas;
  readonly board: Board;
  readonly effects = new EffectLayer();
  hover: Coord | undefined;
  cursor: Coord | undefined;
  ghost: Ghost | undefined;
  private readonly opts: BoardRendererOptions;
  private staticLayer: HTMLCanvasElement;
  private dirty = true;
  private readonly waves: { x: number; y: number; len: number }[] = [];
  private readonly unsubscribe: () => void;

  constructor(bc: BoardCanvas, board: Board, opts: BoardRendererOptions) {
    this.bc = bc;
    this.board = board;
    this.opts = opts;
    this.staticLayer = makeCanvas(bc.canvas.width, bc.canvas.height);
    for (let i = 0; i < 26; i++) {
      this.waves.push({ x: Math.random(), y: Math.random(), len: 2 + Math.floor(Math.random() * 3) });
    }
    this.unsubscribe = loop.add((now, dt) => this.frame(now, dt));
    document.fonts?.ready.then(() => this.markDirty()).catch(() => undefined);
  }

  markDirty(): void {
    this.dirty = true;
  }

  resize(cell: number): void {
    this.bc.resize(cell);
    this.staticLayer = makeCanvas(this.bc.canvas.width, this.bc.canvas.height);
    this.markDirty();
  }

  destroy(): void {
    this.unsubscribe();
    this.effects.clear();
  }

  private frame(now: number, dt: number): void {
    this.effects.update(dt);
    if (this.dirty) this.rebuildStatic();
    const { ctx, bc } = { ctx: this.bc.ctx, bc: this.bc };
    ctx.setTransform(bc.dpr, 0, 0, bc.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, bc.width, bc.height);
    const shake = this.effects.shake();
    ctx.translate(Math.round(shake.x), Math.round(shake.y));
    ctx.drawImage(this.staticLayer, 0, 0, bc.width, bc.height);
    this.drawShimmer(ctx, now);
    if (this.opts.radar) this.drawRadar(ctx, now);
    if (this.ghost) this.drawGhost(ctx, this.ghost);
    if (this.hover) this.drawHover(ctx, this.hover, now);
    if (this.cursor) this.drawCursor(ctx, this.cursor, now);
    this.effects.draw(ctx, bc);
  }

  // ---- static layer -----------------------------------------------------

  private rebuildStatic(): void {
    this.dirty = false;
    const bc = this.bc;
    const ctx = this.staticLayer.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(bc.dpr, 0, 0, bc.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bc.width, bc.height);

    // Water with a faint checker and scattered wave dashes.
    const g0 = bc.cellOrigin(0, 0);
    const span = bc.size * bc.cell;
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(g0.px, g0.py, span, span);
    ctx.fillStyle = PALETTE.waterLight;
    for (let y = 0; y < bc.size; y++) {
      for (let x = 0; x < bc.size; x++) {
        if ((x + y) % 2 === 0) {
          const o = bc.cellOrigin(x, y);
          ctx.fillRect(o.px, o.py, bc.cell, bc.cell);
        }
      }
    }
    const px = bc.artPx;
    ctx.fillStyle = PALETTE.gridBright;
    for (const w of this.waves) {
      const x = Math.round((g0.px + w.x * span) / px) * px;
      const y = Math.round((g0.py + w.y * span) / px) * px;
      ctx.fillRect(x, y, w.len * px, px);
    }

    // Grid lines.
    ctx.fillStyle = PALETTE.grid;
    for (let i = 0; i <= bc.size; i++) {
      ctx.fillRect(g0.px + i * bc.cell, g0.py, 1, span);
      ctx.fillRect(g0.px, g0.py + i * bc.cell, span, 1);
    }
    ctx.fillStyle = PALETTE.gridBright;
    ctx.fillRect(g0.px - 1, g0.py - 1, span + 2, 1);
    ctx.fillRect(g0.px - 1, g0.py + span, span + 2, 1);
    ctx.fillRect(g0.px - 1, g0.py - 1, 1, span + 2);
    ctx.fillRect(g0.px + span, g0.py - 1, 1, span + 2);

    // Labels in the gutter.
    ctx.fillStyle = PALETTE.label;
    ctx.font = `${Math.max(7, Math.round(bc.cell * 0.28))}px ${PIXEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < bc.size; i++) {
      const cx = bc.cellCenter(i, 0).px;
      ctx.fillText(String.fromCharCode(65 + i), cx, bc.gutter / 2 + 1);
      const cy = bc.cellCenter(0, i).py;
      ctx.fillText(String(i + 1), bc.gutter / 2, cy + 1);
    }

    // Ships.
    for (const ship of this.board.ships) {
      if (!this.opts.revealShips && !ship.isSunk) continue;
      const o = bc.cellOrigin(ship.origin.x, ship.origin.y);
      const w = ship.orientation === 'h' ? ship.length * bc.cell : bc.cell;
      const h = ship.orientation === 'h' ? bc.cell : ship.length * bc.cell;
      ctx.drawImage(shipSprite(ship.id, ship.orientation, bc.spriteScale, ship.isSunk ? 'sunk' : 'normal'), o.px, o.py, w, h);
    }

    // Shot markers. Hits on a sunk ship get a light cross so the wreck stays visible.
    const scorch = markerSprite('scorch', bc.spriteScale);
    const hit = markerSprite('hit', bc.spriteScale);
    const miss = markerSprite('miss', bc.spriteScale);
    const cross = markerSprite('cross', bc.spriteScale);
    for (let y = 0; y < bc.size; y++) {
      for (let x = 0; x < bc.size; x++) {
        const mark = this.board.markAt({ x, y });
        if (!mark) continue;
        const o = bc.cellOrigin(x, y);
        if (mark === 'miss') {
          ctx.drawImage(miss, o.px, o.py, bc.cell, bc.cell);
        } else if (this.board.shipAt({ x, y })?.isSunk) {
          ctx.drawImage(cross, o.px, o.py, bc.cell, bc.cell);
        } else {
          ctx.drawImage(scorch, o.px, o.py, bc.cell, bc.cell);
          ctx.drawImage(hit, o.px, o.py, bc.cell, bc.cell);
        }
      }
    }
  }

  // ---- per-frame overlays ------------------------------------------------

  private drawShimmer(ctx: CanvasRenderingContext2D, now: number): void {
    const bc = this.bc;
    const px = bc.artPx;
    const g0 = bc.cellOrigin(0, 0);
    const span = bc.size * bc.cell;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = PALETTE.cyan;
    for (let i = 0; i < 5; i++) {
      const phase = (now / 9000 + i * 0.2) % 1;
      const x = Math.round((g0.px + phase * span) / px) * px;
      const y = Math.round((g0.py + ((i * 0.19 + 0.07) % 1) * span) / px) * px;
      ctx.fillRect(x, y, px * 3, px);
    }
    ctx.globalAlpha = 1;
  }

  private drawRadar(ctx: CanvasRenderingContext2D, now: number): void {
    const bc = this.bc;
    const g0 = bc.cellOrigin(0, 0);
    const span = bc.size * bc.cell;
    const cx = g0.px + span / 2;
    const cy = g0.py + span / 2;
    const R = span * 0.72;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g0.px, g0.py, span, span);
    ctx.clip();
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.14;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * r) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const sweep = ((now / 6000) * Math.PI * 2) % (Math.PI * 2);
    ctx.fillStyle = PALETTE.cyan;
    for (let i = 0; i < 18; i++) {
      const a = sweep - i * 0.04;
      ctx.globalAlpha = 0.11 * (1 - i / 18);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a - 0.04, a);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawGhost(ctx: CanvasRenderingContext2D, ghost: Ghost): void {
    const bc = this.bc;
    const w = ghost.orientation === 'h' ? ghost.length * bc.cell : bc.cell;
    const h = ghost.orientation === 'h' ? bc.cell : ghost.length * bc.cell;
    const o = bc.cellOrigin(ghost.origin.x, ghost.origin.y);
    ctx.save();
    ctx.beginPath();
    const g0 = bc.cellOrigin(0, 0);
    ctx.rect(g0.px, g0.py, bc.size * bc.cell, bc.size * bc.cell);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(shipSprite(ghost.id, ghost.orientation, bc.spriteScale, 'normal'), o.px, o.py, w, h);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ghost.valid ? PALETTE.green : PALETTE.red;
    for (let i = 0; i < ghost.length; i++) {
      const x = ghost.orientation === 'h' ? ghost.origin.x + i : ghost.origin.x;
      const y = ghost.orientation === 'h' ? ghost.origin.y : ghost.origin.y + i;
      if (!inBounds(x, y)) continue;
      const c = bc.cellOrigin(x, y);
      ctx.fillRect(c.px, c.py, bc.cell, bc.cell);
    }
    ctx.restore();
  }

  private drawHover(ctx: CanvasRenderingContext2D, cell: Coord, now: number): void {
    const bc = this.bc;
    const o = bc.cellOrigin(cell.x, cell.y);
    const px = bc.artPx;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 120);
    ctx.fillStyle = this.opts.hoverColor ?? PALETTE.cyan;
    ctx.fillRect(o.px, o.py, bc.cell, px);
    ctx.fillRect(o.px, o.py + bc.cell - px, bc.cell, px);
    ctx.fillRect(o.px, o.py, px, bc.cell);
    ctx.fillRect(o.px + bc.cell - px, o.py, px, bc.cell);
    ctx.globalAlpha = 1;
  }

  private drawCursor(ctx: CanvasRenderingContext2D, cell: Coord, now: number): void {
    const bc = this.bc;
    const o = bc.cellOrigin(cell.x, cell.y);
    const px = bc.artPx;
    const arm = px * 3;
    ctx.globalAlpha = Math.floor(now / 250) % 2 === 0 ? 1 : 0.5;
    ctx.fillStyle = PALETTE.amber;
    for (const [sx, sy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const cx = o.px + sx * bc.cell;
      const cy = o.py + sy * bc.cell;
      ctx.fillRect(sx ? cx - arm : cx, sy ? cy - px : cy, arm, px);
      ctx.fillRect(sx ? cx - px : cx, sy ? cy - arm : cy, px, arm);
    }
    ctx.globalAlpha = 1;
  }
}
