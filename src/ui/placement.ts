import { sfx } from '../audio/sfx.ts';
import { FLEET, GRID_SIZE, shipSpec, type ShipId } from '../core/constants.ts';
import type { Coord, Orientation } from '../core/coord.ts';
import { BoardRenderer } from '../render/boardRenderer.ts';
import { BoardCanvas, fitCellSize } from '../render/canvas.ts';
import { Shake } from '../render/effects.ts';
import { PALETTE } from '../render/palette.ts';
import type { ScreenFactory } from './app.ts';
import { activatesFocusedControl, h, onKey } from './dom.ts';
import { musicToggle, shipIcon } from './widgets.ts';

export const placementScreen: ScreenFactory = (app, root) => {
  const game = app.game ?? app.newGame(app.difficulty);
  const board = game.boards.human;

  let selected: ShipId | null = null;
  let orientation: Orientation = 'h';
  let cursor: Coord = { x: 0, y: 0 };
  let keyboardMode = false;

  /** The dock sits beside the board on wide screens and wraps below it on phones. */
  const placementCell = (): number => Math.min(44, fitCellSize(window.innerWidth - (window.innerWidth < 760 ? 48 : 420), 1));
  const cell = placementCell();
  const canvas = h('canvas');
  const bc = new BoardCanvas(canvas, cell);
  const renderer = new BoardRenderer(bc, board, { revealShips: true, hoverColor: PALETTE.amber });

  const dockButtons = new Map<ShipId, HTMLButtonElement>();
  const music = musicToggle();
  const deployBtn = h('button', { class: 'btn btn-amber', type: 'button', disabled: true, onClick: () => deploy() }, 'DEPLOY FLEET');

  // ---- state helpers ------------------------------------------------------

  /** Snap the origin so the ship stays on the board; validity then only depends on overlap. */
  const snappedOrigin = (id: ShipId): Coord => {
    const length = shipSpec(id).length;
    return {
      x: orientation === 'h' ? Math.min(cursor.x, GRID_SIZE - length) : cursor.x,
      y: orientation === 'v' ? Math.min(cursor.y, GRID_SIZE - length) : cursor.y,
    };
  };

  const refreshGhost = (): void => {
    if (!selected) {
      renderer.ghost = undefined;
      return;
    }
    const origin = snappedOrigin(selected);
    renderer.ghost = {
      id: selected,
      origin,
      orientation,
      length: shipSpec(selected).length,
      valid: game.canPlaceShip(selected, { origin, orientation }),
    };
  };

  const refreshDock = (): void => {
    for (const spec of FLEET) {
      const btn = dockButtons.get(spec.id);
      if (!btn) continue;
      const placed = board.getShip(spec.id) !== undefined;
      btn.classList.toggle('placed', placed);
      btn.classList.toggle('selected', selected === spec.id);
      const state = btn.querySelector('.ship-state');
      if (state) state.textContent = placed ? 'DEPLOYED' : selected === spec.id ? 'PLACING...' : 'IN DOCK';
    }
    deployBtn.disabled = !game.canStartBattle;
    renderer.cursor = !selected && keyboardMode ? cursor : undefined;
  };

  const select = (id: ShipId | null, silent = false): void => {
    selected = id;
    if (!silent && id) sfx.select();
    refreshDock();
    refreshGhost();
  };

  const nextUnplaced = (): ShipId | null => FLEET.find((s) => !board.getShip(s.id))?.id ?? null;

  const pickUp = (id: ShipId): void => {
    const ship = game.removeShip(id);
    if (!ship) return;
    orientation = ship.orientation;
    cursor = { ...ship.origin };
    renderer.markDirty();
    sfx.pickUp();
    select(id, true);
  };

  const place = (): void => {
    if (!selected) return;
    const origin = snappedOrigin(selected);
    if (!game.canPlaceShip(selected, { origin, orientation })) {
      sfx.invalid();
      renderer.effects.add(new Shake(3, 160));
      return;
    }
    game.placeShip(selected, { origin, orientation });
    renderer.markDirty();
    sfx.place();
    select(nextUnplaced(), true);
  };

  const rotate = (): void => {
    orientation = orientation === 'h' ? 'v' : 'h';
    sfx.rotate();
    refreshGhost();
  };

  const randomize = (): void => {
    game.randomizeFleet();
    renderer.markDirty();
    sfx.place();
    select(null, true);
  };

  const clearAll = (): void => {
    game.clearFleet();
    renderer.markDirty();
    sfx.pickUp();
    select(nextUnplaced(), true);
  };

  const deploy = (): void => {
    if (!game.canStartBattle) return;
    game.startBattle();
    sfx.battleStart();
    app.go('battle');
  };

  const moveCursor = (dx: number, dy: number): void => {
    keyboardMode = true;
    cursor = {
      x: Math.max(0, Math.min(GRID_SIZE - 1, cursor.x + dx)),
      y: Math.max(0, Math.min(GRID_SIZE - 1, cursor.y + dy)),
    };
    sfx.hover();
    refreshGhost();
    if (!selected) renderer.cursor = cursor;
  };

  // ---- dock ----------------------------------------------------------------

  const dock = h('div', { class: 'dock panel' }, h('h3', { class: 'panel-title' }, 'FLEET DOCK'));
  FLEET.forEach((spec, i) => {
    const btn = h(
      'button',
      {
        class: 'dock-ship',
        type: 'button',
        onClick: () => (board.getShip(spec.id) ? pickUp(spec.id) : select(spec.id)),
      },
      h('span', {}, `${i + 1}. ${spec.name}`),
      h('span', { class: 'ship-len' }, `${spec.length} CELLS `, h('span', { class: 'ship-state' }, 'IN DOCK')),
      shipIcon(spec.id, 'normal', 12),
    );
    dockButtons.set(spec.id, btn);
    dock.append(btn);
  });

  // ---- layout --------------------------------------------------------------

  const boardWrap = h('div', { class: 'board-wrap own' }, canvas);
  root.append(
    h('h2', { class: 'screen-heading neon c-cyan' }, 'DEPLOY YOUR FLEET'),
    h(
      'div',
      { class: 'placement-layout' },
      h('div', {}, boardWrap, h('div', { class: 'board-caption' }, 'HOME WATERS')),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        dock,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn btn-small', type: 'button', onClick: rotate }, 'ROTATE (R)'),
          h('button', { class: 'btn btn-small btn-amber', type: 'button', onClick: randomize }, 'RANDOM'),
          h('button', { class: 'btn btn-small btn-red', type: 'button', onClick: clearAll }, 'CLEAR'),
          music.el,
        ),
        deployBtn,
        h(
          'div',
          { class: 'hint' },
          'CLICK A SHIP, THEN CLICK THE WATER. CLICK A DEPLOYED SHIP TO MOVE IT.',
          h('br'),
          h('kbd', {}, '1-5'),
          ' SELECT  ',
          h('kbd', {}, 'R'),
          ' ROTATE  ',
          h('kbd', {}, 'ARROWS'),
          ' AIM  ',
          h('kbd', {}, 'ENTER'),
          ' PLACE  ',
          h('kbd', {}, 'ESC'),
          ' BACK',
        ),
      ),
    ),
  );

  // ---- input ---------------------------------------------------------------

  const onPointerMove = (e: PointerEvent): void => {
    keyboardMode = false;
    const c = bc.cellAt(e.clientX, e.clientY);
    if (!c) {
      renderer.hover = undefined;
      return;
    }
    if (c.x !== cursor.x || c.y !== cursor.y) {
      cursor = c;
      refreshGhost();
    }
    renderer.hover = !selected && board.shipAt(c) ? c : undefined;
    renderer.cursor = undefined;
  };
  const onPointerLeave = (): void => {
    renderer.hover = undefined;
  };
  const onClick = (e: MouseEvent): void => {
    const c = bc.cellAt(e.clientX, e.clientY);
    if (!c) return;
    cursor = c;
    if (selected) {
      refreshGhost();
      place();
      return;
    }
    const ship = board.shipAt(c);
    if (ship) pickUp(ship.id);
  };
  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (selected) rotate();
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  const fitBoard = (): void => {
    const next = placementCell();
    if (next !== bc.cell) renderer.resize(next);
  };
  window.addEventListener('resize', fitBoard);

  const offKey = onKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || activatesFocusedControl(e)) return;
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
      case 'r':
      case 'R':
        rotate();
        break;
      case 'Enter':
      case ' ':
        if (selected) place();
        else {
          const ship = board.shipAt(cursor);
          if (ship) pickUp(ship.id);
          else if (game.canStartBattle) deploy();
        }
        break;
      case 'Escape':
        if (selected) select(null);
        else app.go('difficulty');
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5': {
        const spec = FLEET[Number(e.key) - 1];
        if (spec) (board.getShip(spec.id) ? pickUp(spec.id) : select(spec.id));
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  });

  select(nextUnplaced(), true);

  return {
    destroy: () => {
      offKey();
      music.destroy();
      window.removeEventListener('resize', fitBoard);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      renderer.destroy();
    },
  };
};
