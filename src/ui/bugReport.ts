import { sfx } from '../audio/sfx.ts';
import { formatReport, githubIssueUrl } from '../bugReportFormat.ts';
import type { App } from './app.ts';
import { h } from './dom.ts';
import { settings } from './settings.ts';

const recentErrors: string[] = [];

/** Remembers the last few uncaught errors so a bug report can include them. */
export function installErrorCollector(): void {
  const push = (msg: string): void => {
    recentErrors.push(`${new Date().toISOString()} ${msg}`);
    if (recentErrors.length > 10) recentErrors.shift();
  };
  window.addEventListener('error', (e) => push(`${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`unhandled rejection: ${String(e.reason)}`));
}

function captureContext(app: App): Record<string, unknown> {
  const game = app.game;
  const ticker = [...document.querySelectorAll('.ticker .line')].map((l) => l.textContent ?? '');
  return {
    version: __APP_VERSION__,
    time: new Date().toISOString(),
    screen: app.screen,
    difficulty: app.difficulty,
    phase: game?.phase ?? 'no game',
    turn: game?.turn,
    winner: game?.winner,
    score: game?.score,
    stats: game?.stats,
    humanShips: game?.boards.human.ships.map((s) => `${s.id}@${s.origin.x},${s.origin.y}${s.orientation}${s.isSunk ? ' sunk' : ''}`),
    enemyShipsSunk: game?.boards.ai.ships.filter((s) => s.isSunk).map((s) => s.id),
    lastMessages: ticker,
    recentErrors,
    music: settings.get().music,
    reducedMotion: settings.reduceFx,
    viewport: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    userAgent: navigator.userAgent,
  };
}



function openDialog(app: App): void {
  sfx.click();
  const description = h('textarea', {
    class: 'bug-text',
    rows: 5,
    placeholder: 'What happened? What did you expect?',
    maxLength: 2000,
  });
  const status = h('div', { class: 'hint bug-status' }, 'THE REPORT INCLUDES THE CURRENT GAME STATE AND RECENT ERRORS.');
  const close = (): void => overlay.remove();

  const copy = async (): Promise<void> => {
    const text = formatReport(description.value, captureContext(app));
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'REPORT COPIED TO CLIPBOARD.';
    } catch {
      status.textContent = 'CLIPBOARD BLOCKED - SELECT THE TEXT BELOW AND COPY IT.';
      description.value = text;
    }
  };

  const send = async (): Promise<void> => {
    sendBtn.disabled = true;
    status.textContent = 'HANDING OFF TO DEVIN...';
    try {
      const res = await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.value, context: captureContext(app) }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (res.ok && data.url) {
        status.textContent = 'DEVIN IS ON IT. OPENING THE SESSION...';
        window.open(data.url, '_blank', 'noopener');
        setTimeout(close, 1200);
        return;
      }
      status.textContent = data.error === 'not_configured' ? 'DEVIN NOT CONFIGURED ON THIS SERVER - USE COPY REPORT. (SEE .ENV.EXAMPLE)' : `COULD NOT REACH DEVIN: ${data.message ?? res.status}`;
    } catch (err) {
      status.textContent = `COULD NOT REACH THE SERVER: ${(err as Error).message}`;
    }
    sendBtn.disabled = false;
  };

  const openIssue = (): void => {
    if (!__REPO_URL__) return;
    window.open(githubIssueUrl(__REPO_URL__, description.value, captureContext(app)), '_blank', 'noopener');
    status.textContent = 'GITHUB ISSUE OPENED IN A NEW TAB - REVIEW AND SUBMIT IT THERE.';
    setTimeout(close, 1500);
  };

  // The /api/report-bug proxy only exists on the local dev/preview server; the hosted build files GitHub issues.
  const sendBtn = h('button', { class: 'btn btn-small btn-amber', type: 'button', onClick: () => void send() }, 'SEND TO DEVIN');
  const actions = [
    __REPO_URL__ ? h('button', { class: 'btn btn-small btn-amber', type: 'button', onClick: openIssue }, 'OPEN GITHUB ISSUE') : null,
    import.meta.env.DEV ? sendBtn : null,
    h('button', { class: 'btn btn-small', type: 'button', onClick: () => void copy() }, 'COPY REPORT'),
    h('button', { class: 'btn btn-small btn-red', type: 'button', onClick: close }, 'CANCEL'),
  ];
  const overlay = h(
    'div',
    { class: 'confirm bug-dialog' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-title' }, 'REPORT A BUG'),
      description,
      status,
      h('div', { class: 'btn-row' }, ...actions),
    ),
  );
  // Keep game hotkeys (arrows, Enter, M, Esc) from firing while typing.
  overlay.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  document.body.append(overlay);
  description.focus();
}

/** Fixed corner button present on every screen. */
export function mountBugButton(app: App): void {
  document.body.append(h('button', { class: 'bug-button', type: 'button', title: 'Report a bug', onClick: () => openDialog(app) }, 'REPORT BUG'));
}
