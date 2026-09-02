import { sfx } from '../audio/sfx.ts';
import { difficultySpec, shipSpec, type ShipId } from '../core/constants.ts';
import { ART_PX } from '../render/canvas.ts';
import { shipSprite, type ShipLook } from '../render/sprites.ts';
import type { HighScore, Settings } from '../storage.ts';
import { h } from './dom.ts';
import { settings } from './settings.ts';

/** A horizontal ship sprite as a small standalone canvas (dock, HUD). */
export function shipIcon(id: ShipId, look: ShipLook = 'normal', cellPx = 14): HTMLCanvasElement {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const scale = Math.max(1, Math.round((cellPx * dpr) / ART_PX));
  const sprite = shipSprite(id, 'h', scale, look);
  const length = shipSpec(id).length;
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  canvas.style.width = `${length * cellPx}px`;
  canvas.style.height = `${cellPx}px`;
  canvas.title = shipSpec(id).name;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, 0, 0);
  }
  return canvas;
}

/** LED toggle for the music, usable on any screen. Hotkey `M` is wired in main.ts. */
export function musicToggle(): { el: HTMLButtonElement; destroy(): void } {
  const label = h('span', {}, 'MUSIC');
  const chip = h(
    'button',
    {
      class: 'chip',
      type: 'button',
      title: 'Toggle music (M)',
      onClick: () => {
        settings.toggle('music');
        sfx.click();
      },
    },
    h('span', { class: 'led' }),
    label,
  );
  const sync = (s: Settings): void => {
    chip.classList.toggle('on', s.music);
    chip.setAttribute('aria-pressed', String(s.music));
    label.textContent = s.music ? 'MUSIC ON' : 'MUSIC OFF';
  };
  sync(settings.get());
  const off = settings.on(sync);
  return { el: chip, destroy: off };
}

export function scoreTable(list: readonly HighScore[], highlight = -1): HTMLElement {
  const table = h('table', { class: 'score-table' });
  table.append(
    h(
      'thead',
      {},
      h('tr', {}, h('th', {}, '#'), h('th', {}, 'NAME'), h('th', {}, 'RANK'), h('th', {}, 'SHOTS'), h('th', { style: { textAlign: 'right' } }, 'SCORE')),
    ),
  );
  const body = h('tbody');
  if (list.length === 0) {
    body.append(h('tr', {}, h('td', { colSpan: 5, class: 'c-dim' }, 'NO RECORDS YET - BE THE FIRST')));
  }
  list.forEach((entry, i) => {
    body.append(
      h(
        'tr',
        { class: i === highlight ? 'highlight' : '' },
        h('td', {}, String(i + 1).padStart(2, '0')),
        h('td', {}, entry.initials),
        h('td', {}, `${difficultySpec(entry.difficulty).rank}${entry.won ? '' : ' (KIA)'}`),
        h('td', {}, String(entry.shots)),
        h('td', { class: 'num' }, entry.score.toLocaleString('en-US')),
      ),
    );
  });
  table.append(body);
  return table;
}

/** Modal yes/no prompt. Resolves true when confirmed. */
export function confirmDialog(message: string, yesLabel = 'YES', noLabel = 'NO'): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (value: boolean): void => {
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(value);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        // Enter/Space activate whichever button is focused (NO by default).
        e.preventDefault();
        finish(document.activeElement === yes);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === yes ? no : yes).focus();
      }
    };
    const yes = h('button', { class: 'btn btn-red', type: 'button', onClick: () => finish(true) }, yesLabel);
    const no = h('button', { class: 'btn', type: 'button', onClick: () => finish(false) }, noLabel);
    const overlay = h(
      'div',
      { class: 'confirm' },
      h('div', { class: 'panel' }, h('div', {}, message), h('div', { class: 'btn-row' }, yes, no)),
    );
    document.body.append(overlay);
    window.addEventListener('keydown', onKeyDown);
    no.focus();
  });
}

/** Big centred announcement that pops in and fades out. */
export function banner(host: HTMLElement, text: string, tone: 'red' | 'cyan' = 'red'): void {
  const el = h('div', { class: `banner ${tone}` }, text);
  el.addEventListener('animationend', () => el.remove());
  host.append(el);
}
