import { sfx } from '../audio/sfx.ts';
import { difficultySpec } from '../core/constants.ts';
import { loop } from '../render/loop.ts';
import { PALETTE } from '../render/palette.ts';
import { loadScores } from '../storage.ts';
import type { ScreenFactory } from './app.ts';
import { h, onKey } from './dom.ts';
import { settings } from './settings.ts';
import { settingsChips } from './widgets.ts';

interface Star {
  x: number;
  y: number;
  z: number;
  twinkle: number;
}

/** Synthwave backdrop: drifting stars over a perspective floor grid. */
function attractBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const stars: Star[] = Array.from({ length: 110 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.3 + Math.random() * 0.7,
    twinkle: Math.random() * Math.PI * 2,
  }));
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
  const stop = loop.add((now, dt) => {
    const reduce = settings.get().reduceFx;
    const speed = reduce ? 0.15 : 1;
    ctx.clearRect(0, 0, w, h);
    const horizon = h * 0.62;

    // Stars.
    for (const s of stars) {
      s.y += (dt / 60000) * s.z * speed;
      if (s.y > 1) s.y -= 1;
      const a = 0.4 + 0.6 * Math.abs(Math.sin(now / 700 + s.twinkle));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.z > 0.8 ? PALETTE.cyan : PALETTE.white;
      const size = s.z > 0.8 ? 3 : 2;
      ctx.fillRect(Math.round(s.x * w), Math.round(s.y * horizon), size, size);
    }
    ctx.globalAlpha = 1;

    // Setting sun, half below the horizon.
    const sunR = Math.min(w, h) * 0.14;
    const sunY = horizon + sunR * 0.25;
    const grad = ctx.createLinearGradient(0, sunY - sunR, 0, horizon);
    grad.addColorStop(0, PALETTE.yellow);
    grad.addColorStop(1, PALETTE.magenta);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, sunY, sunR, Math.PI, 0);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(w / 2 - sunR, sunY - sunR, sunR * 2, sunR);
    ctx.globalAlpha = 1;
    // Classic horizontal cut lines, denser towards the horizon.
    ctx.fillStyle = PALETTE.bg;
    for (let i = 0; i < 6; i++) {
      const y = horizon - 4 - i * (sunR / 7) * (1 + i * 0.15);
      if (y < sunY - sunR) break;
      ctx.fillRect(w / 2 - sunR, y, sunR * 2, 1 + i * 0.8);
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, horizon, w, sunR);

    // Floor grid.
    ctx.strokeStyle = PALETTE.magenta;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    const vanish = { x: w / 2, y: horizon };
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(vanish.x, vanish.y);
      ctx.lineTo(w / 2 + i * (w / 8), h + 40);
      ctx.stroke();
    }
    const phase = ((now / 2600) * speed) % 1;
    for (let i = 0; i < 12; i++) {
      const t = ((i + phase) / 12) ** 2.2;
      const y = horizon + t * (h - horizon);
      ctx.globalAlpha = 0.15 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Horizon glow.
    ctx.fillStyle = PALETTE.magenta;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, horizon - 1, w, 2);
    ctx.globalAlpha = 1;
  });
  return () => {
    stop();
    window.removeEventListener('resize', resize);
  };
}

export const titleScreen: ScreenFactory = (app, root) => {
  app.playMusic('title');
  const bg = h('canvas', { class: 'title-bg' });
  const stopBg = attractBackground(bg);

  const start = (): void => {
    sfx.select();
    app.go('difficulty');
  };

  const chips = settingsChips();
  const scores = loadScores();
  const marqueeText =
    scores.length === 0
      ? 'TODAY\'S HIGH SCORES  ...  NO RECORDS YET  ...  SINK THE ENEMY FLEET TO CLAIM THE TOP SPOT  ...  '
      : 'TODAY\'S HIGH SCORES  ...  ' +
        scores
          .slice(0, 5)
          .map((s, i) => `${i + 1}. ${s.initials} ${s.score.toLocaleString('en-US')} (${difficultySpec(s.difficulty).rank})`)
          .join('  ...  ') +
        '  ...  ';

  root.append(
    bg,
    h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-top neon' }, 'ARCADE'),
      h('h1', { class: 'logo-main flicker', style: { margin: '0' } }, 'BATTLESHIP'),
      h('div', { class: 'logo-sub neon' }, 'ONE PLAYER VS. THE MACHINE'),
    ),
    h('button', { class: 'press-start blink neon', type: 'button', onClick: start }, 'PRESS START'),
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
          'HIGH SCORES',
        ),
      ),
      chips.el,
      h('div', { class: 'hint' }, h('kbd', {}, 'ENTER'), ' START   ', h('kbd', {}, 'H'), ' HIGH SCORES'),
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
      chips.destroy();
    },
  };
};
