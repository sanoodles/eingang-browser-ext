# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension that injects a side panel on `*.youtube.com`: search the Discogs API for an artist, list their releases, click one to drive YouTube's own search box (in-page, no reload) and focus the first result.

**No build step, bundler, or transpiler** — source files load as-is. Code is modern (ES2022) JS wrapped in IIFE modules (`(function () { "use strict"; ... })()`), no `import`/`export`; everything talks through globals. Use modern syntax freely (arrow callbacks, template literals, destructuring, `async`/`await`, optional chaining/nullish), but keep named helper functions as `function` declarations so the modules' factory order stays free via hoisting. Match that style; keep files small (existing ones are ≤185 lines). Keep code comments highly concise — explain *why* when non-obvious; never narrate what the code plainly says.

## Commands

```bash
npm install            # dev-only: playwright-core (no browser download) + typescript
npm run typecheck      # type-check src/ against its JSDoc (tsc --noEmit; no build)
npm run test:e2e       # or: node test/e2e.js
npm run build          # zip the extension into dist/eingang-<version>.zip
npm run release        # bump version (commit + tag), then build the zip
```

`typecheck` is **not a build step** — `tsc` runs with `noEmit` (config in
`jsconfig.json`), so it only reports type errors; the source still ships as-is.
It checks `src/` against the JSDoc typedefs in `config.js` plus the ambient
declarations in `types/globals.d.ts`. Editors (VS Code) read `jsconfig.json` too.

Shipping is **manual**: upload the built `dist/eingang-<version>.zip` at the
[Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole) and submit for review.

- **Run/reload:** load unpacked from the repo root (folder with `manifest.json`) at `chrome://extensions` (Developer mode on). After editing any file — JS *or* CSS — reload (↻) the extension card, then reload the YouTube tab.
- **Tests:** `test/e2e.js` is the only test: one script that launches headless Chrome with the unpacked extension and walks the whole panel journey, accumulating `check()` assertions (no framework, no per-test filter — edit the `run()` sequence to narrow it). Needs a real browser: `CHROME_BIN` if set, else Brave or Chromium on PATH (the package manager keeps them patched; branded Google Chrome ignores `--load-extension`), else Playwright's Chromium (`npx playwright-core install chromium`) and hits **live YouTube + Discogs**, so it's rate-limited (~25 req/min) and occasionally flaky.

### Releasing

`scripts/` holds zero-dep node helpers (no bundler — the zip is *packaging*, not a build of the source). The release pipeline lives in `package.json`'s scripts so it reads top-to-bottom: `release` is `npm version … && npm run build`. During the bump, npm's `version` hook syncs `manifest.json` (`scripts/sync-version.js`) and prepends the release notes to `CHANGELOG.md` (`scripts/changelog.js`), staging both so they ride in the release commit. The bump type defaults to whatever `scripts/recommend-bump.js` infers from the Conventional Commits since the last `v*` tag (breaking → major, `feat` → minor, else patch), and the `BUMP` env var overrides it:

```bash
npm run release             # bump inferred from commits since the last tag
BUMP=minor npm run release  # force it (also BUMP=major, BUMP=patch, or BUMP=2.0.0)
```

Only the 11 standard Conventional Commit types (`feat`, `fix`, `perf`, `refactor`, `docs`, `build`, `ci`, `test`, `style`, `chore`, `revert`) reach the changelog, grouped under those headings with breaking changes called out on top; any other prefix — or a plain, non-conventional message — is left out, which is the way to keep a commit off the changelog.

`release` commits + tags locally only and stops at the built zip — there's no automated upload. Ship by hand: upload `dist/eingang-<version>.zip` at the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole), submit for Google's review (not instant), then `git push --follow-tags` and merge the release branch into `master` — nothing automates that last step, which is how v1.2.0 sat unmerged until v1.3.0. The step-by-step how-to lives in `CONTRIBUTING.md`; keep the two in sync.

## Architecture

### Two worlds, bridged through the DOM

Content scripts run in **two worlds** (see `manifest.json` `content_scripts`):

- **Isolated** — all panel UI (everything in `src/` except the two `inject-*` files). Shares one namespace, `window.YTSP`.
- **MAIN** — `inject-search.js` + `inject-focus.js`, sharing `window.__ytSearchPanelInject`. They exist *only* because YouTube's framework-bound search input ignores values set from the isolated world.

The worlds can't call each other. Bridge: `panel.js`'s `runYouTubeSearch(text)` writes the query to a `data-yt-search-panel-query` attribute on `<html>` and fires a `yt-search-panel-run` event; `inject-focus.js` hears it, calls `inject-search.js` (which sets the value via the native setter, dispatches `input`, then synthesizes Enter), and polls to focus the first result. A second event, `yt-search-panel-stop-focus` (`stopResultFocus` on `ctx`), ends that poll: the panel fires it whenever it claims the keyboard itself — reopened, or the artist box focused — since the poll would otherwise pull focus straight back out for up to 6s.

### `YTSP` factory/`ctx` wiring

`config.js` creates `window.YTSP` and holds tunable constants (debounce, page sizes, Discogs URLs, `RELEASES_FILL_MIN`), a couple of shared artist-name helpers (`cleanArtistName`, `isVarious`), and the JSDoc typedefs for the shared contract (`Cfg`, `Els`, `Release`, `Ctx`). Each module registers a factory (`YTSP.createReleases`, …) and annotates it `@param {Ctx} ctx` — since there's no `import`/`export`, the typedefs (declared at the **bottom of `config.js`, at top level**, so they're global) are ambient and give autocomplete across files for free, and `npm run typecheck` enforces them. Keep them at the file's top level with nothing following; nested inside the IIFE they'd be file-local, and placed *before* a function the JSDoc would bind to it (duplicate-identifier). `panel.js` (**loaded last**) builds the DOM, gathers elements into `els`, builds `ctx = { els, cfg, runYouTubeSearch }`, then calls every factory and stores the result back on `ctx` (`ctx.releases`, …). Modules reach each other lazily via `ctx`, so factory order is free — but manifest `js` order *is* load order, and `panel.js` must stay last. **Adding a module:** register it in `manifest.json` before `panel.js`, then create its element and instantiate it into `ctx` in `panel.js` (and add it to the `Ctx` typedef in `config.js`).

### Releases: one cache, filters narrow it, paging fills it

`releases.js` fetches `/artists/{id}/releases` (paged, newest first) into one `cache` of **all** releases. Three independent filters, each testing a release's Discogs `role`, narrow what renders: `filters.js` (category chips — the coarse role buckets), `subfilters.js` (role chips, built only from roles present in the cache), and `song-filter.js` (client-side title substring, no network). `appendMatching()` renders releases passing all three; any filter change calls `setFilter()` to rebuild from cache instantly. `fillIfHungry()` keeps auto-paging while fewer than `RELEASES_FILL_MIN` rows match and pages remain — so a restrictive filter can page through the whole discography. Auto-paging (`paging.js`) watches the last row via IntersectionObserver and on keyboard focus reaching it; it and `other-artists.js` build on `roving.js` (one row tabbable, arrows move focus).

### Recent artists

`history.js` keeps the last `HISTORY_MAX` artists actually opened in `chrome.storage.local` (key `STORE_HISTORY`), newest first, deduped by Discogs id — `releases.js`'s `selectArtist()` records each pick. The typeahead shows them in its own dropdown whenever the artist box is empty and focused. That's the *same* `<ul>` the search results use, in a second mode (`ytsp-history-mode`), since the two states are mutually exclusive; every row is a `role="option"`, the clear-all included, so arrows and Enter reach it and `items` stays 1:1 with the list's children. Storing the id, not the typed query, is the point: picking a recent artist goes straight to `/artists/{id}/releases` with no lookup request. Per-row removal is the `×` button (mouse) or Delete on the highlighted row — Tab can't reach the button, since leaving the box closes the dropdown.

### CSS

`layout.css` reflows `<body>` into two columns (YouTube + the panel) and wins a z-index war: the panel sits at `2147483646`, and YouTube's overlays (`tp-yt-iron-dropdown`, `tp-yt-paper-dialog`) + masthead are nudged above it. The panel's width is the `--yt-panel-width` custom property on `<html>` (default 400px), which both the panel's flex-basis and the masthead's right inset read; `panel-chrome.js` rewrites it as the user drags the panel's left edge, and toggles an `ytsp-collapsed` class on `<html>` to hide the panel (revealing a floating reopen tab). Width and collapsed state persist in `chrome.storage.local`. `panel.css` theme variables follow YouTube's light/dark mode (`html[dark]`).

### Discogs API

Unauthenticated: works, but rate-limited (~25/min) and returns no thumbnails; CORS is open so fetching from the page works. URLs/constants in `config.js`.

## File map

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3; content scripts (two worlds), CSS, matches, `storage` permission, `icons/icon48.png` as a web-accessible resource (the reopen tab shows it). `js` order is load order. |
| `src/config.js` | Shared constants, JSDoc typedefs (`Cfg`/`Els`/`Release`/`Ctx`), artist-name helpers (`cleanArtistName`/`isVarious`), and the `YTSP` namespace object. |
| `src/panel-chrome.js` | Collapse/expand toggle (moves focus to the artist box on open) + draggable left edge to resize the panel; persists width & collapsed state. |
| `src/roving.js` | Generic roving-tabindex keyboard navigation for a list. |
| `src/paging.js` | Auto-paging (IntersectionObserver) + loading row for the releases list. |
| `src/release-row.js` | Renders one release row. |
| `src/typeahead.js` | Artist search box: debounced Discogs lookup + suggestion dropdown; the same dropdown lists recent artists while the box is empty. |
| `src/history.js` | Recent artists: records each pick, persists them, serves/removes/clears them. |
| `src/filters.js` | Category filter chips (Releases/Appearances/Unofficial/Credits). |
| `src/subfilters.js` | Role sub-filter chips, built from the roles present in a category. |
| `src/song-filter.js` | Text filter box: case-insensitive substring match on release titles. |
| `src/releases.js` | Loads/caches/renders an artist's releases; the core. |
| `src/other-artists.js` | "Other artists on this release" section. |
| `src/panel.js` | Builds the panel DOM, wires the modules via `ctx`, bootstraps. Loaded last. |
| `src/inject-search.js` | MAIN world: drives YouTube's own search box. |
| `src/inject-focus.js` | MAIN world: hears the panel's request, runs the search, focuses the first result. |
| `css/layout.css` | Two-column page layout + z-index handling for YouTube overlays. |
| `css/panel.css` | Panel container, theme variables, input, suggestions, feedback link. |
| `css/releases.css` | Releases list, filters, loading spinner, other-artists section. |
| `css/yt-results-focus.css` | Keyboard focus ring for YouTube's own results. |
| `test/e2e.js` | The end-to-end test (headless Chrome). |
| `jsconfig.json` | `tsc --noEmit` config for `npm run typecheck` (checks `src/` JSDoc; not a build). |
| `types/globals.d.ts` | Ambient type-only declarations (`window.YTSP`, the bit of `chrome.*` used) for the typecheck. |
