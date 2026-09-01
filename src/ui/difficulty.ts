import { sfx } from '../audio/sfx.ts';
import { DIFFICULTIES, type Difficulty } from '../core/constants.ts';
import type { ScreenFactory } from './app.ts';
import { h, onKey } from './dom.ts';
import { shipIcon } from './widgets.ts';

const CARD_COLORS: Record<Difficulty, string> = {
  cadet: 'var(--green)',
  lieutenant: 'var(--cyan)',
  captain: 'var(--yellow)',
  admiral: 'var(--magenta)',
};

export const difficultyScreen: ScreenFactory = (app, root) => {
  let index = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === app.difficulty));
  const cards: HTMLButtonElement[] = [];

  const choose = (difficulty: Difficulty): void => {
    sfx.battleStart();
    app.newGame(difficulty);
    app.go('placement');
  };

  const highlight = (): void => {
    cards.forEach((c, i) => c.classList.toggle('selected', i === index));
  };

  DIFFICULTIES.forEach((spec, i) => {
    const stars = h('div', { class: 'rank-stars' });
    for (let s = 0; s <= i; s++) stars.append(shipIcon('destroyer', 'normal', 9));
    const card = h(
      'button',
      {
        class: 'rank-card',
        type: 'button',
        onClick: () => choose(spec.id),
      },
      h('div', { class: 'rank-name' }, spec.rank),
      stars,
      h('div', { class: 'rank-blurb' }, spec.blurb),
      h('div', { class: 'rank-mult' }, `SCORE x${spec.multiplier}`),
    );
    card.style.setProperty('--card-color', CARD_COLORS[spec.id]);
    card.addEventListener('mouseenter', () => {
      if (index !== i) {
        index = i;
        highlight();
        sfx.hover();
      }
    });
    cards.push(card);
  });
  highlight();

  root.append(
    h('h2', { class: 'screen-heading neon c-cyan' }, 'SELECT YOUR OPPONENT'),
    h('div', { class: 'rank-cards' }, ...cards),
    h(
      'div',
      { class: 'hint' },
      h('kbd', {}, '\u2190'),
      ' ',
      h('kbd', {}, '\u2192'),
      ' CHOOSE   ',
      h('kbd', {}, 'ENTER'),
      ' CONFIRM   ',
      h('kbd', {}, 'ESC'),
      ' BACK',
    ),
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
            app.go('title');
          },
        },
        'BACK',
      ),
    ),
  );

  const offKey = onKey((e) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        index = (index + DIFFICULTIES.length - 1) % DIFFICULTIES.length;
        highlight();
        sfx.menuMove();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        index = (index + 1) % DIFFICULTIES.length;
        highlight();
        sfx.menuMove();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose((DIFFICULTIES[index] ?? DIFFICULTIES[0])!.id);
        break;
      case 'Escape':
        app.go('title');
        break;
      default:
        return;
    }
  });

  return { destroy: offKey };
};
