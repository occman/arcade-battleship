import { shipSpec, type ShipId } from '../core/constants.ts';
import type { Orientation } from '../core/coord.ts';
import { ART_PX } from './canvas.ts';
import { PALETTE, SHIP_ACCENT } from './palette.ts';
import { PixelGrid, renderPixelMap, rotateCCW, type Legend, type PixelMap } from './pixel.ts';

export type ShipLook = 'normal' | 'sunk';

/**
 * Procedural top-down pixel art, 8 px wide and 8 px per cell long, rounded
 * stern on the left and pointed bow on the right.
 * Legend: h hull, d outline, l light trim, a accent colour.
 */
function shipMap(id: ShipId): PixelMap {
  const length = shipSpec(id).length;
  const W = length * ART_PX;
  const g = new PixelGrid(W, ART_PX);
  const span = (y: number, x0: number, x1: number, ch: string): void => g.rect(x0, y, x1 - x0 + 1, 1, ch);
  const outlined = (y: number, x0: number, x1: number, fill: string): void => {
    span(y, x0, x1, fill);
    g.set(x0, y, 'd');
    g.set(x1, y, 'd');
  };

  if (id === 'submarine') {
    // Slim cigar hull, conning tower amidships, periscope.
    span(2, 3, W - 4, 'd');
    outlined(3, 1, W - 2, 'l');
    outlined(4, 1, W - 2, 'h');
    span(5, 3, W - 4, 'd');
    g.set(W - 1, 3, 'd');
    g.set(W - 1, 4, 'd');
    g.rect(10, 3, 4, 2, 'a');
    g.set(12, 2, 'l');
    return g.toMap();
  }

  // Common surface hull.
  span(1, 3, W - 6, 'd');
  outlined(2, 2, W - 4, 'l');
  outlined(3, 1, W - 2, 'h');
  outlined(4, 1, W - 1, 'h');
  outlined(5, 2, W - 4, 'h');
  span(6, 3, W - 6, 'd');

  switch (id) {
    case 'destroyer':
      g.rect(6, 3, 3, 2, 'a');
      g.set(7, 2, 'l');
      g.rect(11, 3, 1, 2, 'd');
      g.set(12, 3, 'l');
      g.set(3, 4, 'd');
      break;
    case 'cruiser':
      g.rect(9, 3, 5, 2, 'a');
      g.set(11, 2, 'l');
      g.rect(5, 3, 2, 2, 'd');
      g.set(7, 3, 'l');
      g.rect(17, 3, 2, 2, 'd');
      g.set(19, 3, 'l');
      break;
    case 'battleship':
      g.rect(13, 2, 6, 4, 'a');
      g.set(14, 2, 'l');
      g.rect(5, 3, 2, 2, 'd');
      g.set(7, 3, 'l');
      g.rect(9, 3, 2, 2, 'd');
      g.set(11, 3, 'l');
      g.rect(22, 3, 2, 2, 'd');
      g.set(21, 4, 'l');
      break;
    case 'carrier':
      // Flight deck with a dashed centre line and an island offset to starboard.
      g.rect(3, 2, W - 8, 4, 'a');
      for (let x = 5; x < W - 8; x += 4) g.rect(x, 3, 2, 1, 'l');
      g.rect(25, 4, 6, 2, 'h');
      g.set(26, 4, 'l');
      g.set(30, 5, 'd');
      break;
    default:
      break;
  }
  return g.toMap();
}

function legendFor(id: ShipId, look: ShipLook): Legend {
  if (look === 'sunk') {
    return { h: PALETTE.sunkHull, d: PALETTE.red, l: PALETTE.sunkLight, a: PALETTE.sunkDark };
  }
  return { h: PALETTE.hull, d: PALETTE.hullDark, l: PALETTE.hullLight, a: SHIP_ACCENT[id] };
}

const mapCache = new Map<string, PixelMap>();

export function shipPixelMap(id: ShipId, orientation: Orientation): PixelMap {
  const key = `${id}|${orientation}`;
  let map = mapCache.get(key);
  if (!map) {
    map = orientation === 'h' ? shipMap(id) : rotateCCW(shipMap(id));
    mapCache.set(key, map);
  }
  return map;
}

/** Cached sprite at `scale` device pixels per art pixel. */
export function shipSprite(id: ShipId, orientation: Orientation, scale: number, look: ShipLook = 'normal'): HTMLCanvasElement {
  return renderPixelMap(shipPixelMap(id, orientation), legendFor(id, look), scale, `ship|${id}|${orientation}|${look}|${scale}`);
}

const HIT_MAP: PixelMap = [
  '........',
  '..rrrr..',
  '.rooooor',
  '.roryyor',
  '.royyror',
  '.rooooor',
  '..rrrr..',
  '........',
];

const MISS_MAP: PixelMap = [
  '........',
  '........',
  '...ww...',
  '..wccw..',
  '..wccw..',
  '...ww...',
  '........',
  '........',
];

const SCORCH_MAP: PixelMap = [
  '.kk..kk.',
  'kkkkkkkk',
  'kkkkkkkk',
  '.kkkkkk.',
  'kkkkkkk.',
  'kkkkkkkk',
  '.kkkkkk.',
  '..kk.kk.',
];

const CROSS_MAP: PixelMap = [
  'x......x',
  'xx....xx',
  '.xx..xx.',
  '..xxxx..',
  '..xxxx..',
  '.xx..xx.',
  'xx....xx',
  'x......x',
];

export function markerSprite(kind: 'hit' | 'miss' | 'scorch' | 'cross', scale: number): HTMLCanvasElement {
  switch (kind) {
    case 'hit':
      return renderPixelMap(HIT_MAP, { r: PALETTE.ember, o: PALETTE.orange, y: PALETTE.yellow }, scale, `hit|${scale}`);
    case 'miss':
      return renderPixelMap(MISS_MAP, { w: '#e8fbff', c: PALETTE.cyan }, scale, `miss|${scale}`);
    case 'scorch':
      return renderPixelMap(SCORCH_MAP, { k: 'rgba(0,0,0,0.55)' }, scale, `scorch|${scale}`);
    case 'cross':
      return renderPixelMap(CROSS_MAP, { x: 'rgba(255, 106, 0, 0.85)' }, scale, `cross|${scale}`);
  }
}
