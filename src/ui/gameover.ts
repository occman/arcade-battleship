import { sfx } from '../audio/sfx.ts';
import { difficultySpec } from '../core/constants.ts';
import { insertScore, loadScores, qualifies, saveScores, type HighScore } from '../storage.ts';
import type { ScreenFactory } from './app.ts';
import { clear, h, onKey } from './dom.ts';
import { scoreTable } from './widgets.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

export const gameOverScreen: ScreenFactory = (app, root) => {
  const game = app.game;
  if (!game || game.phase !== 'over') {
    queueMicrotask(() => app.go('title'));
    return { destroy: () => undefined };
  }
  app.playMusic(null);

  const won = game.winner === 'human';
  const spec = difficultySpec(game.difficulty);
  const stats = game.stats;
  const bonus = game.currentBonus();
  const finalScore = game.finalScore;
  const accuracy = stats.human.shots ? Math.round((stats.human.hits / stats.human.shots) * 100) : 0;
  const seconds = Math.max(0, Math.round(((stats.endedAt ?? Date.now()) - stats.startedAt) / 1000));
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  (won ? sfx.victory : sfx.defeat)();

  const stat = (label: string, value: string, cls = ''): HTMLElement =>
    h('div', { class: 'stat panel' }, h('div', { class: 'stat-label' }, label), h('div', { class: `stat-value ${cls}` }, value));

  const row = (label: string, value: number, cls = ''): HTMLElement =>
    h('div', { class: `row ${cls}` }, h('span', {}, label), h('span', {}, value.toLocaleString('en-US')));

  const tableHost = h('div', { class: 'panel', style: { width: '100%', maxWidth: '640px' } });
  const entryHost = h('div');
  let offEntryKeys: (() => void) | null = null;

  const showTable = (list: readonly HighScore[], highlight: number): void => {
    clear(tableHost);
    tableHost.append(h('h3', { class: 'panel-title' }, 'HALL OF ADMIRALS'), scoreTable(list, highlight));
  };

  const buttons = h(
    'div',
    { class: 'btn-row' },
    h(
      'button',
      {
        class: 'btn btn-amber',
        type: 'button',
        onClick: () => {
          sfx.select();
          app.newGame(app.difficulty);
          app.go('placement');
        },
      },
      'PLAY AGAIN',
    ),
    h(
      'button',
      {
        class: 'btn',
        type: 'button',
        onClick: () => {
          sfx.click();
          app.go('difficulty');
        },
      },
      'CHANGE RANK',
    ),
    h(
      'button',
      {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => {
          sfx.click();
          app.go('title');
        },
      },
      'MAIN MENU',
    ),
  );

  root.append(
    h('h1', { class: `result-title neon ${won ? 'c-green' : 'c-red'} flicker` }, won ? 'VICTORY' : 'DEFEAT'),
    h(
      'div',
      { class: 'result-sub' },
      won ? `ENEMY FLEET DESTROYED IN ${stats.human.shots} SHOTS  -  ${spec.rank} DEFEATED` : `YOUR FLEET WAS LOST TO THE ${spec.rank}  -  ${stats.human.sunk}/5 ENEMY SHIPS SUNK`,
    ),
    h(
      'div',
      { class: 'stats-grid' },
      stat('SHOTS', String(stats.human.shots)),
      stat('HITS', String(stats.human.hits), 'c-orange'),
      stat('ACCURACY', `${accuracy}%`, 'c-cyan'),
      stat('SHIPS SUNK', `${stats.human.sunk}/5`, 'c-green'),
      stat('SHIPS LOST', `${stats.ai.sunk}/5`, 'c-red'),
      stat('TIME', duration),
    ),
    h(
      'div',
      { class: 'breakdown panel' },
      h('h3', { class: 'panel-title' }, 'SCORE'),
      row('BATTLE SCORE', game.score),
      row('ACCURACY BONUS', bonus.accuracy),
      row('EFFICIENCY BONUS', bonus.efficiency),
      row(`TOTAL (${spec.rank} x${spec.multiplier})`, finalScore, 'total'),
    ),
    entryHost,
    tableHost,
    buttons,
  );

  // ---- initials entry ---------------------------------------------------------

  const scores = loadScores();
  if (qualifies(finalScore, scores)) {
    const letters = ['A', 'A', 'A'];
    let index = 0;
    const slots = letters.map((ch, i) => h('div', { class: `slot ${i === 0 ? 'active' : ''}` }, ch));
    const render = (): void => {
      slots.forEach((slot, i) => {
        slot.textContent = letters[i] ?? 'A';
        slot.classList.toggle('active', i === index);
      });
    };
    const cycle = (dir: number): void => {
      const current = ALPHABET.indexOf(letters[index] ?? 'A');
      letters[index] = ALPHABET[(current + dir + ALPHABET.length) % ALPHABET.length] ?? 'A';
      sfx.type();
      render();
    };
    const commit = (): void => {
      offEntryKeys?.();
      offEntryKeys = null;
      const entry: HighScore = {
        initials: letters.join('').trimEnd().padEnd(3, '-') || 'AAA',
        score: finalScore,
        difficulty: game.difficulty,
        won,
        shots: stats.human.shots,
        date: new Date().toISOString(),
      };
      const { list, rank } = insertScore(scores, entry);
      saveScores(list);
      sfx.highScore();
      clear(entryHost);
      entryHost.append(h('div', { class: 'result-sub c-green neon' }, `NEW HIGH SCORE - RANK #${rank + 1}`));
      showTable(list, rank);
      buttons.querySelector('button')?.focus();
    };

    entryHost.append(
      h(
        'div',
        { class: 'initials panel' },
        h('div', { class: 'c-amber neon' }, 'HIGH SCORE! ENTER YOUR INITIALS'),
        h('div', { class: 'initials-slots' }, ...slots),
        h('div', { class: 'hint' }, 'TYPE OR USE ', h('kbd', {}, '\u2191'), h('kbd', {}, '\u2193'), '  ', h('kbd', {}, 'ENTER'), ' TO CONFIRM'),
        h('button', { class: 'btn btn-small btn-amber', type: 'button', onClick: commit }, 'CONFIRM'),
      ),
    );
    showTable(scores, -1);

    offEntryKeys = onKey((e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === 'ARROWUP') cycle(1);
      else if (key === 'ARROWDOWN') cycle(-1);
      else if (key === 'ARROWLEFT') index = Math.max(0, index - 1);
      else if (key === 'ARROWRIGHT') index = Math.min(2, index + 1);
      else if (key === 'BACKSPACE') {
        letters[index] = 'A';
        index = Math.max(0, index - 1);
        sfx.type();
      } else if (key === 'ENTER') {
        e.preventDefault();
        commit();
        return;
      } else if (key.length === 1 && ALPHABET.includes(key)) {
        letters[index] = key;
        index = Math.min(2, index + 1);
        sfx.type();
      } else return;
      e.preventDefault();
      render();
    });
  } else {
    showTable(scores, -1);
  }

  const offKeys = onKey((e) => {
    if (offEntryKeys || e.defaultPrevented) return; // initials entry owns the keyboard
    if (e.key === 'Enter') {
      app.newGame(app.difficulty);
      app.go('placement');
    } else if (e.key === 'Escape') {
      app.go('title');
    }
  });

  return {
    destroy: () => {
      offKeys();
      offEntryKeys?.();
    },
  };
};
