# AGENTS.md

## What this is

A single-file HTML5 Canvas clone of **Asteroids** (Spanish UI). Four files total, zero
dependencies, zero build step:

- `index.html` — page, inline CSS, `<canvas id="canvas" width="800" height="600">`, and
  `<script src="game.js"></script>` (a **classic** script, not a module).
- `game.js` — the entire game (~420 lines): input, entity classes, state machine,
  update/draw loop.
- `favicon.svg`, `README.md` (Spanish product spec).
- `.github/workflows/` — CI: `opencode.yml` (bot en comentarios) and `issue-triage.yml`
  (triaje de issues). `.github/scripts/triage-issue.cjs` — lógica del triaje.

There is no `package.json`, lockfile, test runner, linter, formatter, or
`opencode.json`. The only workflows are the two GitHub Actions above.

## Running and verification

- Open `index.html` directly in a browser — it works from `file://` (no fetch, no modules).
- Optional static server (README): `npx serve .` → `http://localhost:3000`.
- There is **no automated test or lint command**. The only verification is opening the
  page and playing. Don't invent npm scripts; if you add tooling, keep the "double-click
  `index.html`" path working.
- Controls are keyboard-only: `←`/`→` rotate, `↑` thrust, `Space` fire, `Space` restarts
  on GAME OVER. Exercise changes via the keyboard.

## Architecture (`game.js`)

One top-level script, single global scope — no modules, no `import`/`export`, no IIFE.
All state is shared globals:

- `canvas`, `ctx` (2D context), `W`/`H` (800/600), `keys`/`justPressed` input maps.
- Entity arrays `bullets`, `asteroids`, `particles` plus `ship`, `score`, `lives`,
  `level`, `state`, `deadTimer`.
- Classes `Bullet`, `Asteroid`, `Ship`, `Particle`. Each exposes `update(dt)` and
  `draw()`; entities are killed by setting `dead = true` and filtering the array at the
  end of the update step.
- State machine inside `update()`: `playing` | `dead` (respawn countdown) | `gameover`.
  `initGame()` resets everything; `nextLevel()` bumps the level and respawns.
- `loop(ts)` derives `dt` from `requestAnimationFrame`, clamped to 0.05 s max.
- Space is toroidal: all position updates go through `wrap(v, max)`.

## Conventions and gotchas

- **Canvas size is duplicated**: the `width`/`height` attributes in `index.html` *and*
  `W`/`H` in `game.js`. Change both.
- `game.js` stays a classic script and its tag must remain **after** the `<canvas>`
  element (it grabs `document.getElementById('canvas')` at top level).
- UI text and the README are **Spanish** (`SCORE`, `NIVEL`, `PUNTAJE`, `GAME OVER`,
  `lang="es"`). Match that for any new HUD text.
- Asteroid "size" is an index, not a count: `3` = large, `2` = medium, `1` = small.
  `RADII` / `SPEEDS` / `POINTS` are indexed by size with index `0` unused; points are
  20 / 50 / 100 for large / medium / small.
- **Edge-triggered input**: `pressed(code)` returns true once then clears the flag, so
  call it exactly once per frame per key, inside the branch that handles it.
  `keys[code]` is the held state.
- `dist()` is plain Euclidean distance and does **not** account for the toroidal wrap,
  so collisions across the screen edge are missed. If you fix it, wrap the delta before
  measuring.
- Ship-vs-asteroid collision uses `a.radius * 0.82` to shrink the asteroid hitbox
  (deliberately forgiving). Preserve that when retuning difficulty.
- Respawn sets `invincible = 3` seconds; the ship blinks by skipping `draw()` on
  alternating frames.
- Asteroid outlines are generated at construction with 8–13 random vertices; `rot` and
  `rotSpeed` are radians.
- **Palette**: every color comes from the `THEMES` map in `game.js`; `theme.<token>`
  is the single source of truth (background, HUD text, power-up colors, overlays).
  `D` toggles the theme and it is persisted in `localStorage` (`asteroids.theme`).
  Skins may add `strokeLight` / `fillLight` / `flameLight` overrides for the light
  theme; without them the base color is used.
- The README is currently in sync with the code (power-ups and the "estrella fugaz"
  are implemented). If you add a feature, update both in the same commit.

## Issue triage automation

`.github/workflows/issue-triage.yml` runs on `issues: [opened]` (and manually via
`workflow_dispatch` with an `issue_number` input). It calls
`.github/scripts/triage-issue.cjs` through `actions/github-script`:

- **Never rewrites what the reporter wrote.** The auto-generated section is appended at
  the end of the body between `<!-- triage:auto:start -->` and `<!-- triage:auto:end -->`.
  If the markers are already present the whole block is replaced (idempotent).
- Adds a Spanish summary table (author, date, commit, language, category, areas,
  priority), the detected signals (steps / environment / screenshot / code) and a
  reviewer checklist with the likely files to look at.
- Applies labels: category (`bug`, `enhancement`, `question`, `documentation`), area
  (`gameplay`, `ui`, `controls`, `performance`, `skins`), `needs-info` and
  `priority: high|medium|low`. Labels are created on demand with a fixed color.
- Classification is **deterministic keyword scoring** (no LLM): text is lowercased,
  accents stripped and matched by whole words, in Spanish and English.
- Opt out per issue by putting `<!-- triage-skip -->` in the body. Issues opened by
  bots are skipped automatically.
- Needs `issues: write`; if the repo restricts the default `GITHUB_TOKEN` to read-only,
  the workflow cannot apply labels or edit the body.

## Style

2-space indent, single quotes, semicolons, `const`/`let` (no `var`), ES6 classes,
`'use strict'` at the top of `game.js`. `// ── Section ──` banner comments delimit the
file's regions; keep them if you restructure.
