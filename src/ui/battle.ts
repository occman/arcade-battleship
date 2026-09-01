import { sfx } from '../audio/sfx.ts';
import type { Board, ShotResult } from '../core/board.ts';
import { difficultySpec, FLEET, GRID_SIZE } from '../core/constants.ts';
import { coordLabel, type Coord } from '../core/coord.ts';
import type { Game, Side } from '../core/game.ts';
import { BoardRenderer } from '../render/boardRenderer.ts';
import { BoardCanvas, fitCellSize } from '../render/canvas.ts';
import { Explosion, Flash, FloatingText, fx, Reticle, Shake, ShellFlight, SinkCinematic, Splash } from '../render/effects.ts';
import { wait } from '../render/loop.ts';
import { PALETTE } from '../render/palette.ts';
import type { ScreenFactory } from './app.ts';
import { clear, h, onKey } from './dom.ts';
import { banner, confirmDialog, shipIcon } from './widgets.ts';

const MAX_TICKER_LINES = 4;

export const battleScreen: ScreenFactory = (app, root) => {
  const current = app.game;
  if (!current || current.phase !== 'battle') {
    queueMicrotask(() => app.go('title'));
    return { destroy: () => undefined };
  }
  const game: Game = current;
  const isOver = (): boolean => game.phase === 'over';
  app.playMusic('battle');

  // ---- boards --------------------------------------------------------------

  const cell = Math.max(28, Math.min(40, fitCellSize(window.innerWidth - 120, 2)));
  const ownCanvas = h('canvas');
  const enemyCanvas = h('canvas');
  const own = new BoardRenderer(new BoardCanvas(ownCanvas, cell), game.boards.human, { revealShips: true, hoverColor: PALETTE.yellow });
  const enemy = new BoardRenderer(new BoardCanvas(enemyCanvas, cell), game.boards.ai, { revealShips: false, hoverColor: PALETTE.cyan });

  let alive = true;
  let locked = false;
  let keyboardMode = false;
  let cursor: Coord = { x: 4, y: 4 };
  let pendingScore: { delta: number; coord: Coord } | null = null;
  const offScore = game.events.on('score', (e) => {
    pendingScore = { delta: e.delta, coord: e.coord };
  });

  // ---- HUD -----------------------------------------------------------------

  const spec = difficultySpec(game.difficulty);
  const turnLabel = h('div', { class: 'turn-label neon c-green' });
  const scoreValue = h('div', { class: 'score-value' }, '0');
  const shotsLabel = h('div', { class: 'score-label' });
  const ownStatus = h('div', { class: 'fleet-status' });
  const enemyStatus = h('div', { class: 'fleet-status' });
  const ticker = h('div', { class: 'ticker panel' });
  const enemyWrap = h('div', { class: 'board-wrap' }, enemyCanvas);
  const ownWrap = h('div', { class: 'board-wrap own' }, ownCanvas);

  const renderStatus = (host: HTMLElement, board: Board, reveal: boolean): void => {
    clear(host);
    for (const s of FLEET) {
      const ship = board.getShip(s.id);
      const sunk = ship?.isSunk ?? false;
      const icon = shipIcon(s.id, sunk ? 'sunk' : 'normal', 8);
      if (sunk) icon.classList.add('sunk');
      if (!reveal && !sunk) icon.style.opacity = '0.4';
      host.append(icon);
    }
  };

  const updateHud = (): void => {
    const yourTurn = game.turn === 'human' && game.phase === 'battle' && !locked;
    if (game.phase === 'over') {
      turnLabel.textContent = game.winner === 'human' ? 'ENEMY FLEET DESTROYED' : 'YOUR FLEET WAS LOST';
      turnLabel.className = `turn-label neon ${game.winner === 'human' ? 'c-green' : 'c-red'}`;
    } else {
      turnLabel.textContent = yourTurn ? 'YOUR TURN - FIRE!' : game.turn === 'human' ? 'FIRING...' : 'ENEMY TURN';
      turnLabel.className = `turn-label neon ${yourTurn ? 'c-green' : 'c-magenta'}`;
    }
    scoreValue.textContent = game.score.toLocaleString('en-US');
    const { shots, hits } = game.stats.human;
    shotsLabel.textContent = `SHOTS ${shots}  HITS ${hits}  ACC ${shots ? Math.round((hits / shots) * 100) : 0}%`;
    renderStatus(ownStatus, game.boards.human, true);
    renderStatus(enemyStatus, game.boards.ai, false);
    enemyWrap.classList.toggle('locked', !yourTurn);
  };

  const log = (text: string, cls = ''): void => {
    ticker.append(h('div', { class: `line ${cls}` }, text));
    while (ticker.children.length > MAX_TICKER_LINES) ticker.firstChild?.remove();
  };

  // ---- shot presentation -----------------------------------------------------

  async function playShot(renderer: BoardRenderer, result: ShotResult, by: Side): Promise<void> {
    const c = result.coord;
    const label = coordLabel(c);
    const scoreText = pendingScore ? `+${pendingScore.delta.toLocaleString('en-US')}` : null;
    pendingScore = null;

    if (result.outcome !== 'hit') {
      sfx.splash();
      log(by === 'human' ? `${label} ... MISS` : `ENEMY FIRES AT ${label} ... MISS`, by === 'human' ? '' : 'good');
      await renderer.effects.run(new Splash(c));
      updateHud();
      return;
    }

    sfx.hit();
    renderer.effects.add(new Flash(PALETTE.orange, by === 'human' ? 0.25 : 0.35));
    renderer.effects.add(new Shake(by === 'human' ? 5 : 7));
    log(by === 'human' ? `${label} ... HIT!` : `ENEMY FIRES AT ${label} ... HIT!`, 'hit');
    const boom = renderer.effects.run(new Explosion(c, result.sunk ? 1.35 : 1));
    if (scoreText && !result.sunk) renderer.effects.add(new FloatingText(c, scoreText, PALETTE.yellow));
    await boom;

    const ship = result.sunk;
    if (ship) {
      sfx.sunk();
      renderer.effects.add(new Shake(10, 650));
      const name = ship.name.toUpperCase();
      if (by === 'human') {
        log(`YOU SUNK THE ENEMY ${name}!`, 'sunk');
        banner(root, `${name} SUNK!`, 'red');
        if (scoreText) renderer.effects.add(new FloatingText(c, scoreText, PALETTE.yellow, 1400));
      } else {
        log(`THE ENEMY SUNK YOUR ${name}!`, 'sunk');
        banner(root, `${name} LOST!`, 'red');
      }
      updateHud();
      await renderer.effects.run(new SinkCinematic({ id: ship.id, origin: ship.origin, orientation: ship.orientation, length: ship.length }));
    }
    updateHud();
  }

  // ---- turn sequencing -------------------------------------------------------

  async function humanFire(c: Coord): Promise<void> {
    if (!alive || locked || game.phase !== 'battle' || game.turn !== 'human') return;
    if (game.boards.ai.markAt(c)) {
      sfx.invalid();
      log(`${coordLabel(c)} ALREADY TARGETED`);
      return;
    }
    locked = true;
    enemy.hover = undefined;
    enemy.cursor = undefined;
    updateHud();
    sfx.launch();
    await enemy.effects.run(new ShellFlight(c, 'bottom'));
    if (!alive) return;
    const result = game.fire(c);
    enemy.markDirty();
    await playShot(enemy, result, 'human');
    if (!alive) return;
    if (isOver()) return finish();
    await aiTurn();
  }

  async function aiTurn(): Promise<void> {
    updateHud();
    await wait(350 * fx.durationScale);
    if (!alive || game.phase !== 'battle') return;
    // The shot is resolved now, but the board is not redrawn until the shell lands.
    const result = game.aiFire();
    await own.effects.run(new Reticle(result.coord, () => sfx.reticleTick()));
    if (!alive) return;
    sfx.lockOn();
    await wait(160 * fx.durationScale);
    sfx.launch();
    await own.effects.run(new ShellFlight(result.coord, 'top'));
    if (!alive) return;
    own.markDirty();
    await playShot(own, result, 'ai');
    if (!alive) return;
    if (isOver()) return finish();
    locked = false;
    updateHud();
    sfx.yourTurn();
    if (keyboardMode) enemy.cursor = cursor;
  }

  async function finish(): Promise<void> {
    locked = true;
    updateHud();
    app.playMusic(null);
    await wait(1400 * fx.durationScale);
    if (alive) app.go('gameover');
  }

  const quit = async (): Promise<void> => {
    if (game.phase !== 'battle') return;
    const yes = await confirmDialog('ABANDON SHIP? THIS COUNTS AS A DEFEAT.', 'ABANDON', 'KEEP FIGHTING');
    if (yes && alive) {
      game.forfeit();
      app.go('gameover');
    }
  };

  // ---- layout ----------------------------------------------------------------

  root.append(
    h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud-side panel' },
        h('div', { class: 'panel-title' }, 'YOUR FLEET'),
        ownStatus,
      ),
      h(
        'div',
        { class: 'hud-center panel' },
        turnLabel,
        h('div', { class: 'score-label' }, 'SCORE'),
        scoreValue,
        shotsLabel,
        h('div', { class: 'score-label c-dim' }, `VS ${spec.rank}  x${spec.multiplier}`),
      ),
      h(
        'div',
        { class: 'hud-side right panel' },
        h('div', { class: 'panel-title' }, 'ENEMY FLEET'),
        enemyStatus,
      ),
    ),
    h(
      'div',
      { class: 'boards' },
      h('div', {}, ownWrap, h('div', { class: 'board-caption' }, 'HOME WATERS')),
      h('div', {}, enemyWrap, h('div', { class: 'board-caption c-cyan' }, 'ENEMY WATERS - CLICK TO FIRE')),
    ),
    ticker,
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn btn-small btn-red', type: 'button', onClick: () => void quit() }, 'ABANDON SHIP (ESC)'),
    ),
    h('div', { class: 'hint' }, h('kbd', {}, 'ARROWS'), ' AIM  ', h('kbd', {}, 'ENTER'), ' FIRE'),
  );

  log(`BATTLE STATIONS! ENGAGING ${spec.rank} AI.`, 'good');
  log('YOUR TURN. SELECT A TARGET IN ENEMY WATERS.');
  updateHud();

  // ---- input -----------------------------------------------------------------

  const onPointerMove = (e: PointerEvent): void => {
    keyboardMode = false;
    enemy.cursor = undefined;
    const c = enemy.bc.cellAt(e.clientX, e.clientY);
    const canAim = !locked && game.phase === 'battle' && game.turn === 'human';
    enemy.hover = c && canAim && !game.boards.ai.markAt(c) ? c : undefined;
    if (c) cursor = c;
  };
  const onPointerLeave = (): void => {
    enemy.hover = undefined;
  };
  const onClick = (e: MouseEvent): void => {
    const c = enemy.bc.cellAt(e.clientX, e.clientY);
    if (c) void humanFire(c);
  };
  enemyCanvas.addEventListener('pointermove', onPointerMove);
  enemyCanvas.addEventListener('pointerleave', onPointerLeave);
  enemyCanvas.addEventListener('click', onClick);

  const moveCursor = (dx: number, dy: number): void => {
    keyboardMode = true;
    cursor = {
      x: Math.max(0, Math.min(GRID_SIZE - 1, cursor.x + dx)),
      y: Math.max(0, Math.min(GRID_SIZE - 1, cursor.y + dy)),
    };
    enemy.hover = undefined;
    if (!locked) enemy.cursor = cursor;
    sfx.hover();
  };

  const offKey = onKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowLeft':
        moveCursor(-1, 0);
        break;
      case 'ArrowRight':
        moveCursor(1, 0);
        break;
      case 'ArrowUp':
        moveCursor(0, -1);
        break;
      case 'ArrowDown':
        moveCursor(0, 1);
        break;
      case 'Enter':
      case ' ':
        keyboardMode = true;
        void humanFire(cursor);
        break;
      case 'Escape':
        void quit();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  return {
    destroy: () => {
      alive = false;
      offKey();
      offScore();
      enemyCanvas.removeEventListener('pointermove', onPointerMove);
      enemyCanvas.removeEventListener('pointerleave', onPointerLeave);
      enemyCanvas.removeEventListener('click', onClick);
      own.destroy();
      enemy.destroy();
    },
  };
};
