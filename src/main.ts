import '@fontsource/press-start-2p/400.css';
import './styles/theme.css';
import './styles/base.css';
import './styles/crt.css';
import './styles/screens.css';

import { audio, installAudioUnlock } from './audio/engine.ts';
import { music } from './audio/music.ts';
import { sfx } from './audio/sfx.ts';
import { App } from './ui/app.ts';
import { battleScreen } from './ui/battle.ts';
import { installCrashReporter, installErrorCollector, mountBugButton } from './ui/bugReport.ts';
import { difficultyScreen } from './ui/difficulty.ts';
import { gameOverScreen } from './ui/gameover.ts';
import { highScoresScreen } from './ui/highscores.ts';
import { placementScreen } from './ui/placement.ts';
import { settings } from './ui/settings.ts';
import { titleScreen } from './ui/title.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

installErrorCollector();
installAudioUnlock();
settings.apply();
window.addEventListener('keydown', (e) => {
  if (e.key !== 'm' && e.key !== 'M') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.initials')) return; // typing initials on the game-over screen
  settings.toggle('music');
});

const app = new App(root);
app.register('title', titleScreen);
app.register('difficulty', difficultyScreen);
app.register('placement', placementScreen);
app.register('battle', battleScreen);
app.register('gameover', gameOverScreen);
app.register('highscores', highScoresScreen);
app.go('title');
mountBugButton(app);
installCrashReporter(app);

// Dev-only console handles for poking at the running game (never shipped in the build).
if (import.meta.env.DEV) {
  Object.assign(window, { __app: app, __debug: { audio, music, sfx, settings } });
}
