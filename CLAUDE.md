# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gridiron Dynasty: a single-page browser football-coordinator game. Plain HTML + vanilla JS with no build step and no runtime dependencies. Keep it that way: no npm packages in the game, no bundlers, modules or frameworks. `package.json` exists only for dev tooling (ESLint). To play it, open `index.html` directly (file://).

## How the pieces fit

- Scripts are classic `<script>` tags loaded in this order in `index.html`, and they talk through globals: `gridiron.js` (`window.GRID`, rules and numbers) → `gridiron-lines.js` (`window.GRID_LINES`, commentary pools) → `core.js` (`window.GM`, the frame: cash, saving, toasts, tabs) → `gridiron-game.js` (the game, which calls `GM.register(api => ({...}))`).
- **All tuning numbers belong in `gridiron.js`** (`GRID`). Don't hard-code balance values in `gridiron-game.js`; add a key to `GRID` and read it via `C.<key>` with a fallback.
- Rendering is full-page string templates: every click/change/submit runs the game handler and then `render()` rewrites `#stage` innerHTML. Buttons route through `data-gm="<action>"` (plus `data-id`/`data-tab`/`data-slot`) to the `click(a, t)` switch near the end of `gridiron-game.js`. Escape user text with `h()`.
- `HV` in `gridiron-game.js` holds view-only state that is never saved. Saved game state is `api.state('grid')` (`H()`).
- The underscored members returned by the game (`_resolve`, `_doCall`, `_start`, `_settle`, …) are test hooks. Keep them when refactoring.

## Saves must never break

- Everything is saved to localStorage under the key `gridiron-dynasty` (see `core.js`). Players have long-running careers there.
- `norm(raw)` in `gridiron-game.js` **rebuilds the saved state from scratch** on every load. A new state field gets silently dropped on reload unless it is added to `norm()` with a safe default for old saves. The same applies to new player fields (`normP`) and playbook fields (`normBook`).
- Don't rename or repurpose existing saved fields. Add new ones beside them.
- Backups (Home tab → "Your save") live in `core.js`. The file is `{ app: 'gridiron-dynasty', exported, save: G }`. Imports go through `norm()` and `GAME.norm()`, and **every string has `< > " \`` stripped** so a shared file can't inject markup. So never store HTML or straight double quotes in saved state: escape at render time with `h()`.

## UI / CSS

- All CSS lives inline in `index.html`. Colors are `:root` tokens. The two dark-mode blocks (`@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`) must stay identical.
- The game must work well on phones. Respect the existing breakpoints (`640px` is the main phone one; also 480/700/860/1000), keep touch targets ≥44px, and avoid horizontal page scroll.
- Class prefixes `farm-`, `shop-`, `bb-` and `bk-` are inherited from an earlier farm/basketball version of the frame. They're still in use by football, so don't treat them as dead CSS.
- Update the in-game "How it works" list (`farm-how` in the Home tab) when a rule players need to know changes.

## Verifying changes

- A PostToolUse hook (`.claude/hooks/check-js.js`) runs `node --check` and ESLint on every edited `.js` file. A syntax error in `gridiron-game.js` shows up in the browser only as "The game didn't load."
- `npm run lint` lints everything (run `npm install` first). The page scripts share globals (`GRID`, `GRID_LINES`, `GM`, `render`). Declare any new cross-file global in `eslint.config.js`.
- Use the `/sim` skill to auto-play games headlessly in Node when checking balance changes or looking for runtime errors.
