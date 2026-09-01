/** Rows of characters; '.' is transparent, anything else is looked up in a legend. */
export type PixelMap = readonly string[];
export type Legend = Readonly<Record<string, string>>;

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/** Rotates a pixel map 90 degrees counter-clockwise (right edge becomes the top). */
export function rotateCCW(map: PixelMap): PixelMap {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const out: string[] = [];
  for (let x = w - 1; x >= 0; x--) {
    let row = '';
    for (let y = 0; y < h; y++) row += map[y]?.[x] ?? '.';
    out.push(row);
  }
  return out;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Renders a pixel map at `scale` device pixels per art pixel, cached by content. */
export function renderPixelMap(map: PixelMap, legend: Legend, scale: number, cacheKey?: string): HTMLCanvasElement {
  const key = cacheKey ?? `${scale}|${JSON.stringify(legend)}|${map.join('/')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const canvas = makeCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  for (let y = 0; y < h; y++) {
    const row = map[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      if (ch === '.') continue;
      const color = legend[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  cache.set(key, canvas);
  return canvas;
}

/** Mutable character grid used to build pixel maps procedurally. */
export class PixelGrid {
  readonly width: number;
  readonly height: number;
  private readonly rows: string[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  }

  set(x: number, y: number, ch: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    (this.rows[y] as string[])[x] = ch;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch);
  }

  toMap(): PixelMap {
    return this.rows.map((r) => r.join(''));
  }
}

/**
 * Fills a circle snapped to an art-pixel grid (CSS px units). Cheap for the
 * small radii used by explosions and splashes.
 */
export function pixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  px: number,
  color: string,
  ring = 0,
): void {
  ctx.fillStyle = color;
  const r2 = radius * radius;
  const inner2 = ring > 0 ? (radius - ring) * (radius - ring) : -1;
  const x0 = Math.floor((cx - radius) / px) * px;
  const y0 = Math.floor((cy - radius) / px) * px;
  for (let y = y0; y <= cy + radius; y += px) {
    for (let x = x0; x <= cx + radius; x += px) {
      const dx = x + px / 2 - cx;
      const dy = y + px / 2 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 > inner2) ctx.fillRect(x, y, px, px);
    }
  }
}
