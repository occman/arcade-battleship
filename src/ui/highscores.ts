import { sfx } from '../audio/sfx.ts';
import { loadScores } from '../storage.ts';
import type { ScreenFactory } from './app.ts';
import { activatesFocusedControl, h, onKey } from './dom.ts';
import { scoreTable } from './widgets.ts';

export const highScoresScreen: ScreenFactory = (app, root) => {
  const back = (): void => {
    sfx.click();
    app.go('title');
  };
  root.append(
    h('h2', { class: 'screen-heading neon c-amber' }, 'HALL OF ADMIRALS'),
    h('div', { class: 'panel' }, scoreTable(loadScores())),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: back }, 'BACK')),
    h('div', { class: 'hint' }, h('kbd', {}, 'ESC'), ' BACK'),
  );
  const offKey = onKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || activatesFocusedControl(e)) return;
    if (e.key === 'Escape' || e.key === 'Enter') back();
  });
  return { destroy: offKey };
};
