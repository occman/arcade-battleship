---
name: testing-arcade-battleship
description: How to run and UI-test the Arcade Battleship Vite game (dev server, debug handles, phone emulation, quirks of the automation Chrome)
---

# Testing Arcade Battleship in the browser

## Run it
- `source ~/.nvm/nvm.sh && nvm use 22` (Vite 8 needs Node ^20.19 or >=22.12; the box default 20.18 fails with "Cannot find native binding"), `npm install`, `npm run dev` → http://localhost:5173/.
- Check a dev server is not already running first: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`.
- Dev builds expose `window.__game` (current match) and `window.__debug`; production builds don't.

## Navigating quickly
- Title → PRESS START → rank card → placement (first ship pre-selected; click water places, `R` rotates) → RANDOM → DEPLOY FLEET → battle.
- Esc on placement first *deselects* the current ship; a second Esc goes back to difficulty.
- Forfeit (ABANDON SHIP → ABANDON) still yields a game-over score = battle points; any score > 0 qualifies for initials entry while the table has < 10 entries, so land one hit before abandoning to test the initials UI without winning.
- To find an enemy ship cell for a guaranteed hit (locating only, still fire via the UI):
  `for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (__game.boards.ai.shipAt({ x, y }) && !__game.boards.ai.markAt({ x, y })) console.log({ x, y });`
- High scores live in localStorage key `arcade-battleship:scores:v1`; clear it to reset the table.

## Quirks of the automation Chrome
- The provided Chrome runs with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,...`, and `matchMedia('(hover: none)')` reports **true** even at desktop size. So `(hover: hover)`-gated styles won't show and the battle caption reads "TAP TO FIRE" instead of "CLICK TO FIRE" on desktop — this is an environment artefact, not an app bug.
- Chrome is launched with `--mute-audio`; the only console entry you'll see is the standard "AudioContext was not allowed to start" warning after a reload (not an error).
- Phone emulation: F12 → Ctrl+Shift+M, pick iPhone 12 Pro (390) / Samsung Galaxy S8+ (360). Reload after switching so screen-size-dependent canvas sizing recalculates. The page scrolls the `html` element; scroll inside the emulated viewport. The fixed REPORT BUG button legitimately overlays content mid-scroll; only check overlap when scrolled fully to the bottom.
- Verify horizontal overflow with `document.documentElement.scrollWidth === innerWidth`.

## Crash banner / GitHub issue links
- `installCrashReporter` and OPEN GITHUB ISSUE are no-ops unless `__REPO_URL__` is set: start the dev server with `DEVIN_REPO=https://github.com/occman/arcade-battleship npm run dev -- --port 5173` (or put it in `.env.local`). Check with `__REPO_URL__` in the console.
- Trigger crashes from the DevTools console (F12), not the CDP console tool (it rejects top-level `await`): `setTimeout(() => { throw new TypeError('boom') })` and `Promise.reject(new Error('rej'))`. Same message only banners once per page load and only 3 distinct banners per load — reload between scenarios.
- REPORT CRASH / OPEN GITHUB ISSUE open github.com, which redirects to `/login?return_to=<issue URL>`. Decode it in that tab's console: `u = new URL(new URL(location.href).searchParams.get('return_to')); [u.pathname, u.searchParams.get('title'), u.searchParams.get('labels'), u.searchParams.get('body')]`.
- DevTools console auto-closes quotes/brackets; long typed snippets with `'...' + '...'` can get mangled — keep them simple.

## Devin Secrets Needed
- None for gameplay testing. `DEVIN_API_KEY` / `DEVIN_ORG_ID` / `DEVIN_REPO` in `.env.local` only if testing the REPORT BUG → Devin session flow.
