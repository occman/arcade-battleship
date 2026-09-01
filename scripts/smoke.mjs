/**
 * Headless UI smoke test: drives every screen in Chrome via the DevTools
 * protocol, plays a full game against the Cadet, and fails on any uncaught
 * exception. Screenshots land in .smoke/.
 *
 * Requires a running dev server (`npm run dev`) and Google Chrome.
 * Usage: npm run smoke [-- url=http://localhost:5173 chrome=/path/to/chrome]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const URL = args.url ?? 'http://localhost:5173/';
const CHROME = args.chrome ?? process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 100);
const OUT = '.smoke';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${OUT}/profile`, `--remote-debugging-port=${PORT}`, '--window-size=1280,960', 'about:blank'],
  { stdio: 'ignore' },
);

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

const ws = await connect();
await new Promise((r) => (ws.onopen = r));
const pending = new Map();
const problems = [];
let nextId = 1;
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    problems.push(`exception: ${d.text} ${d.exception?.description ?? ''}`);
  } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    problems.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
  return r.result.value;
};
const shot = async (name) => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const screen = () => js(`document.getElementById('app').dataset.screen`);
const click = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ' + ${JSON.stringify(selector)}); el.click(); })()`);
const clickCell = (wrap, x, y) =>
  js(`(() => {
    const c = document.querySelector(${JSON.stringify(wrap)} + ' canvas'); const r = c.getBoundingClientRect(); const cell = r.width / 11;
    const init = { clientX: r.left + cell * (${x} + 1.5), clientY: r.top + cell * (${y} + 1.5), bubbles: true };
    c.dispatchEvent(new PointerEvent('pointermove', init)); c.dispatchEvent(new MouseEvent('click', init));
  })()`);
const key = async (k, code, text) => {
  const base = { key: k, code, windowsVirtualKeyCode: text ? text.charCodeAt(0) : k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 };
  await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
};
const waitTurn = async () => {
  for (let i = 0; i < 200; i++) {
    if (await js(`window.__game.phase === 'over' || !document.querySelector('.board-wrap:not(.own)').classList.contains('locked')`)) return;
    await sleep(100);
  }
  throw new Error('battle never unlocked');
};
const expect = (cond, what) => {
  if (!cond) throw new Error(`expected ${what}`);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1200);
  await js(`localStorage.setItem('arcade-battleship:settings:v1', JSON.stringify({ sfx: true, music: false, crt: true, reduceFx: true }))`);
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  expect((await screen()) === 'title', 'title screen');
  await shot('01-title');

  await click('.press-start');
  await sleep(300);
  expect((await screen()) === 'difficulty', 'difficulty screen');
  await shot('02-difficulty');

  await click('.rank-card:nth-child(1)');
  await sleep(400);
  expect((await screen()) === 'placement', 'placement screen');
  await clickCell('.board-wrap', 2, 2); // place carrier
  await key('r', 'KeyR', 'r');
  await clickCell('.board-wrap', 8, 4); // battleship, vertical
  await clickCell('.board-wrap', 3, 2); // pick the carrier back up
  await clickCell('.board-wrap', 0, 9); // drop it on the bottom row
  await click('.btn.btn-yellow'); // random for the rest
  await sleep(200);
  await shot('03-placement');
  await click('.btn.btn-magenta'); // deploy
  await sleep(600);
  expect((await screen()) === 'battle', 'battle screen');

  const targets = await js(`window.__game.boards.ai.ships.flatMap((s) => s.cells.map((c) => [c.x, c.y]))`);
  await clickCell('.board-wrap:not(.own)', 0, 0);
  await sleep(200);
  await waitTurn();
  await clickCell('.board-wrap:not(.own)', 0, 0); // repeat shot must be rejected without a turn change
  expect((await js(`window.__game.turn`)) === 'human', 'repeat shot to be ignored');
  let n = 0;
  for (const [x, y] of targets) {
    if (await js(`window.__game.boards.ai.markAt({ x: ${x}, y: ${y} }) !== undefined`)) continue;
    await clickCell('.board-wrap:not(.own)', x, y);
    if (++n === 5) {
      await sleep(700);
      await shot('04-battle-sink');
    }
    await sleep(200);
    await waitTurn();
    if ((await js(`window.__game.phase`)) === 'over') break;
  }
  expect((await js(`window.__game.winner`)) === 'human', 'human victory');
  await sleep(1800);
  expect((await screen()) === 'gameover', 'game over screen');
  await shot('05-gameover');
  if (await js(`!!document.querySelector('.initials')`)) {
    for (const ch of 'ACE') await key(ch, `Key${ch}`, ch);
    await key('Enter', 'Enter');
    await sleep(400);
    expect((await screen()) === 'gameover', 'Enter to only confirm initials');
    expect((await js(`JSON.parse(localStorage.getItem('arcade-battleship:scores:v1')).length`)) >= 1, 'score saved');
    await shot('06-highscore-entered');
  }
  await key('Escape', 'Escape');
  await sleep(400);
  expect((await screen()) === 'title', 'back to title');
  await key('h', 'KeyH', 'h');
  await sleep(400);
  expect((await screen()) === 'highscores', 'high scores screen');
  await shot('07-highscores');
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`smoke OK (${n + 1} shots to win, screenshots in ${OUT}/)`);
} catch (err) {
  console.error('SMOKE FAILED:', err.message);
  for (const p of problems) console.error(' ', p);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill('SIGKILL');
}
