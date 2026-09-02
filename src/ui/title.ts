import { sfx } from '../audio/sfx.ts';
import { difficultySpec } from '../core/constants.ts';
import { loop } from '../render/loop.ts';
import { PALETTE } from '../render/palette.ts';
import { loadScores } from '../storage.ts';
import type { ScreenFactory } from './app.ts';
import { h, onKey } from './dom.ts';
import { settings } from './settings.ts';
import { musicToggle } from './widgets.ts';

interface Star {
  x: number;
  y: number;
  twinkle: number;
}
interface Blip {
  angle: number;
  radius: number;
}

/**
 * Attract-mode backdrop: a radar scope sweeping over a night ocean, with the
 * silhouette of a fleet on the horizon and a distant strike lighting the sky.
 */
function attractBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const stars: Star[] = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.55, twinkle: Math.random() * Math.PI * 2 }));
  const blips: Blip[] = Array.from({ length: 9 }, () => ({ angle: Math.random() * Math.PI * 2, radius: 0.2 + Math.random() * 0.75 }));
  let w = 0;
  let h = 0;
  const resize = (): void => {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const stop = loop.add((now) => {
    const speed = settings.reduceFx ? 0.25 : 1;
    ctx.clearRect(0, 0, w, h);
    const horizon = h * 0.68;

    // Sky and stars.
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#010613');
    sky.addColorStop(1, '#062a52');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(now / 900 + s.twinkle));
      ctx.fillStyle = PALETTE.white;
      ctx.fillRect(Math.round(s.x * w), Math.round(s.y * horizon), 2, 2);
    }
    ctx.globalAlpha = 1;

    // Distant strike: a pulsing orange glow on the horizon, left of centre.
    const pulse = 0.55 + 0.45 * Math.sin(now / 1300);
    const glowX = w * 0.3;
    const glow = ctx.createRadialGradient(glowX, horizon, 0, glowX, horizon, w * 0.22);
    glow.addColorStop(0, `rgba(255, 122, 0, ${0.55 * pulse})`);
    glow.addColorStop(0.4, `rgba(255, 60, 0, ${0.22 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - w * 0.22, w, w * 0.22);

    // Radar scope behind the logo.
    const cx = w / 2;
    const cy = h * 0.4;
    const R = Math.min(w, h) * 0.36;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(2, 40, 80, 0.35)';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.strokeStyle = PALETTE.gridBright;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    const cellPx = R / 6;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * cellPx, cy - R);
      ctx.lineTo(cx + i * cellPx, cy + R);
      ctx.moveTo(cx - R, cy + i * cellPx);
      ctx.lineTo(cx + R, cy + i * cellPx);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = PALETTE.cyan;
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * r) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Sweep with a fading trail.
    const sweep = ((now / 4200) * speed * Math.PI * 2) % (Math.PI * 2);
    for (let i = 0; i < 28; i++) {
      const a = sweep - i * 0.035;
      ctx.globalAlpha = 0.28 * (1 - i / 28);
      ctx.fillStyle = PALETTE.cyan;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a - 0.035, a);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    ctx.stroke();
    // Blips light up as the sweep passes and fade until it returns.
    for (const b of blips) {
      const since = (sweep - b.angle + Math.PI * 2) % (Math.PI * 2);
      const a = Math.max(0, 1 - since / (Math.PI * 1.6));
      ctx.globalAlpha = a;
      ctx.fillStyle = a > 0.85 ? PALETTE.white : PALETTE.amber;
      const bx = cx + Math.cos(b.angle) * b.radius * R;
      const by = cy + Math.sin(b.angle) * b.radius * R;
      ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
    }
    ctx.restore();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Fleet silhouettes on the horizon.
    ctx.fillStyle = '#01050c';
    const ships: [number, number, number][] = [
      [0.12, 90, 10],
      [0.3, 150, 14],
      [0.58, 70, 8],
      [0.82, 120, 12],
    ];
    for (const [fx, len, hgt] of ships) {
      const x = fx * w;
      ctx.fillRect(x, horizon - hgt, len, hgt);
      ctx.fillRect(x + len * 0.55, horizon - hgt - 12, 8, 12);
      ctx.fillRect(x + len * 0.58, horizon - hgt - 22, 2, 10);
    }

    // Ocean with rolling pixel waves.
    const sea = ctx.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, '#0a3d6e');
    sea.addColorStop(1, '#02101f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.fillStyle = PALETTE.cyan;
    for (let row = 0; row < 14; row++) {
      const t = row / 14;
      const y = horizon + 6 + t * t * (h - horizon);
      const amp = 2 + t * 6;
      const wavelength = 60 + t * 140;
      ctx.globalAlpha = 0.12 + t * 0.25;
      for (let x = 0; x < w; x += 6) {
        const yy = y + Math.sin((x / wavelength + (now / 2800) * speed + row) * Math.PI * 2) * amp;
        ctx.fillRect(x, Math.round(yy), 4, 2);
      }
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#7fe9ff';
    ctx.fillRect(0, horizon, w, 1);
    ctx.globalAlpha = 1;
  });
  return () => {
    stop();
    window.removeEventListener('resize', resize);
  };
}

const star = (): SVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('class', 'star');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 0 L6.2 3.6 L10 3.8 L7 6.2 L8.1 10 L5 7.8 L1.9 10 L3 6.2 L0 3.8 L3.8 3.6 Z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
};

export const titleScreen: ScreenFactory = (app, root) => {
  app.playMusic('title');
  const bg = h('canvas', { class: 'title-bg' });
  const stopBg = attractBackground(bg);

  const start = (): void => {
    sfx.select();
    app.go('difficulty');
  };

  const music = musicToggle();
  const scores = loadScores();
  const marqueeText =
    scores.length === 0
      ? 'FLEET RECORDS  ...  NO RECORDS YET  ...  SINK THE ENEMY FLEET TO CLAIM THE TOP SPOT  ...  '
      : 'FLEET RECORDS  ...  ' +
        scores
          .slice(0, 5)
          .map((s, i) => `${i + 1}. ${s.initials} ${s.score.toLocaleString('en-US')} (${difficultySpec(s.difficulty).rank})`)
          .join('  ...  ') +
        '  ...  ';

  const stars = h('div', { class: 'ribbon-stars c-amber' });
  for (let i = 0; i < 5; i++) stars.append(star());

  root.append(
    bg,
    h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-top' }, 'ARCADE'),
      h('h1', { class: 'logo-main', style: { margin: '0' } }, 'BATTLESHIP'),
      h('div', { class: 'ribbon' }, 'NAVAL WARFARE - ONE PLAYER VS. THE MACHINE'),
      stars,
    ),
    h('button', { class: 'press-start blink', type: 'button', onClick: start }, 'PRESS START'),
    h(
      'div',
      { class: 'title-menu' },
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => {
              sfx.click();
              app.go('highscores');
            },
          },
          'FLEET RECORDS',
        ),
        music.el,
      ),
      h('div', { class: 'hint' }, h('kbd', {}, 'ENTER'), ' START   ', h('kbd', {}, 'H'), ' RECORDS   ', h('kbd', {}, 'M'), ' MUSIC'),
    ),
    h('div', { class: 'marquee' }, h('span', {}, marqueeText)),
  );

  const offKey = onKey((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      start();
    } else if (e.key === 'h' || e.key === 'H') {
      app.go('highscores');
    }
  });

  return {
    destroy: () => {
      stopBg();
      offKey();
      music.destroy();
    },
  };
};
