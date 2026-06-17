# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension that injects a side panel on `*.youtube.com`: search the Discogs API for an artist, list their releases, click one to drive YouTube's own search box (in-page, no reload) and focus the first result.

**No build step, bundler, or transpiler** — source files load as-is. Code is plain ES5 IIFE modules (`(function () { "use strict"; ... })()`), no `import`/`export`; everything talks through globals. Match that style; keep files small (existing ones are ≤160 lines).

## Commands

```bash
npm install            # dev-only: playwright-core (no browser download)
npm run test:e2e       # or: node test/e2e.js
```

- **Run/reload:** load unpacked from the repo root (folder with `manifest.json`) at `chrome://extensions` (Developer mode on). After editing any file — JS *or* CSS — reload (↻) the extension card, then reload the YouTube tab.
- **Tests:** `test/e2e.js` is the only test: one script that launches headless Chrome with the unpacked extension and walks the whole panel journey, accumulating `check()` assertions (no framework, no per-test filter — edit the `run()` sequence to narrow it). Needs a real browser (`CHROME_BIN`, or `npx playwright install chromium`) and hits **live YouTube + Discogs**, so it's rate-limited (~25 req/min) and occasionally flaky.

## Architecture

### Two worlds, bridged through the DOM

Content scripts run in **two worlds** (see `manifest.json` `content_scripts`):

- **Isolated** — all panel UI (everything in `src/` except the two `inject-*` files). Shares one namespace, `window.YTSP`.
- **MAIN** — `inject-search.js` + `inject-focus.js`, sharing `window.__ytSearchPanelInject`. They exist *only* because YouTube's framework-bound search input ignores values set from the isolated world.

The worlds can't call each other. Bridge: `panel.js`'s `runYouTubeSearch(text)` writes the query to a `data-yt-search-panel-query` attribute on `<html>` and fires a `yt-search-panel-run` event; `inject-focus.js` hears it, calls `inject-search.js` (which sets the value via the native setter, dispatches `input`, then synthesizes Enter), and polls to focus the first result.

### `YTSP` factory/`ctx` wiring

`config.js` creates `window.YTSP` and holds tunable constants (debounce, page sizes, Discogs URLs, `RELEASES_FILL_MIN`). Each module registers a factory (`YTSP.createReleases`, …). `panel.js` (**loaded last**) builds the DOM, gathers elements into `els`, builds `ctx = { els, cfg, runYouTubeSearch }`, then calls every factory and stores the result back on `ctx` (`ctx.releases`, …). Modules reach each other lazily via `ctx`, so factory order is free — but manifest `js` order *is* load order, and `panel.js` must stay last. **Adding a module:** register it in `manifest.json` before `panel.js`, then create its element and instantiate it into `ctx` in `panel.js`.

### Releases: one cache, filters narrow it, paging fills it

`releases.js` fetches `/artists/{id}/releases` (paged, newest first) into one `cache` of **all** releases. Three independent filters, each testing a release's Discogs `role`, narrow what renders: `filters.js` (category chips — the coarse role buckets), `subfilters.js` (role chips, built only from roles present in the cache), and `song-filter.js` (client-side title substring, no network). `appendMatching()` renders releases passing all three; any filter change calls `setFilter()` to rebuild from cache instantly. `fillIfHungry()` keeps auto-paging while fewer than `RELEASES_FILL_MIN` rows match and pages remain — so a restrictive filter can page through the whole discography. Auto-paging (`paging.js`) watches the last row via IntersectionObserver and on keyboard focus reaching it; it and `other-artists.js` build on `roving.js` (one row tabbable, arrows move focus).

### CSS

`layout.css` reflows `<body>` into two columns (YouTube + 400px panel) and wins a z-index war: the panel sits at `2147483646`, and YouTube's overlays (`tp-yt-iron-dropdown`, `tp-yt-paper-dialog`) + masthead are nudged above it. `panel.css` theme variables follow YouTube's light/dark mode (`html[dark]`).

### Discogs API

Unauthenticated: works, but rate-limited (~25/min) and returns no thumbnails; CORS is open so fetching from the page works. URLs/constants in `config.js`.

## File map

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3; lists content scripts, CSS, matches, and the two worlds. `js` order is load order. |
| `src/config.js` | Shared constants and the `YTSP` namespace object. |
| `src/roving.js` | Generic roving-tabindex keyboard navigation for a list. |
| `src/paging.js` | Auto-paging (IntersectionObserver) + loading row for the releases list. |
| `src/release-row.js` | Renders one release row. |
| `src/typeahead.js` | Artist search box: debounced Discogs lookup + suggestion dropdown. |
| `src/filters.js` | Category filter chips (Releases/Appearances/Unofficial/Credits). |
| `src/subfilters.js` | Role sub-filter chips, built from the roles present in a category. |
| `src/song-filter.js` | Text filter box: case-insensitive substring match on release titles. |
| `src/releases.js` | Loads/caches/renders an artist's releases; the core. |
| `src/other-artists.js` | "Other artists on this release" section. |
| `src/panel.js` | Builds the panel DOM, wires the modules via `ctx`, bootstraps. Loaded last. |
| `src/inject-search.js` | MAIN world: drives YouTube's own search box. |
| `src/inject-focus.js` | MAIN world: hears the panel's request, runs the search, focuses the first result. |
| `css/layout.css` | Two-column page layout + z-index handling for YouTube overlays. |
| `css/panel.css` | Panel container, theme variables, input, suggestions. |
| `css/releases.css` | Releases list, filters, loading spinner, other-artists section. |
| `css/yt-results-focus.css` | Keyboard focus ring for YouTube's own results. |
| `test/e2e.js` | The end-to-end test (headless Chrome). |
