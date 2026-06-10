# Discogs artist releases on YouTube

A Chrome extension that adds a full-height side panel to YouTube. The panel's
search box is a typeahead for [Discogs](https://www.discogs.com) artists: pick an
artist, browse their releases sorted newest-first, and click a release to run an
in-page YouTube search for it.

## What it does

- **Artist typeahead** — type an artist name; after a short pause it queries the
  Discogs API and shows matching artists in a dropdown.
- **Releases list** — selecting an artist lists their releases (newest first).
  More pages load automatically as you scroll toward the bottom.
- **Category filter** — chips above the list narrow it to **Releases**,
  **Appearances**, **Unofficial**, or **Credits**, the same buckets Discogs uses
  on an artist page. Switching is instant for what's loaded, and the list keeps
  paging to fill in a category whose entries start further down the discography.
- **Role sub-filter** — a second chip row narrows the active category by the
  Discogs role of each entry (e.g. Credits → Remixes / Production; Appearances →
  full release / on a track). The chips are built from the roles present, so
  single-role categories (Releases, Unofficial) show none, and a role's chip
  appears once an entry with that role has loaded.
- **Search YouTube** — clicking a release drives YouTube's own search box (an
  in-page navigation, no full reload) and moves keyboard focus to the first
  result.
- **Other artists** — selecting a release shows the other headline artists
  credited on it; clicking one searches for that artist.

## Requirements

- A Chromium-based browser: Chrome, Chromium, Edge, or Brave.
- Nothing to build or install — it's plain JavaScript and CSS, loaded directly.

## Install in developer mode

The extension isn't packed or published, so you load the source folder directly
("load unpacked").

1. Get the source onto your machine (clone or download this folder).
2. Open your browser's extensions page:
   - Chrome / Chromium: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode** (toggle in the top-right on Chrome/Brave, or in the
   left sidebar on Edge).
4. Click **Load unpacked** and select this project's root folder — the one that
   contains `manifest.json`.
5. The "Discogs artist releases on YouTube" entry appears in the list. Open or reload any
   `youtube.com` tab and the panel shows up on the right.

### After you change the code

Click the **reload** (↻) icon on the extension's card at `chrome://extensions`,
then reload the YouTube tab. CSS-only changes still need the extension reload to
take effect.

## Using the panel

1. Type an artist name (at least two characters) in the box at the top right.
2. Pick an artist from the dropdown.
3. Scroll the releases list; it pages in more automatically.
4. Click a release — YouTube searches for `<release artist> <release title>` and
   focuses the first result. The artist is the one credited on that release (so a
   production or guest spot searches under the right name); a compilation's
   `Various` is dropped, leaving just the title.

### Keyboard

- **In the search box:** `↑`/`↓` move through suggestions, `Enter` selects,
  `Esc` closes the dropdown. With the dropdown closed, `↓` jumps into the
  releases list.
- **In the releases / other-artists lists:** `↑`/`↓` move between rows, `Home`/`End`
  jump to the first/last, `Enter` or `Space` activates a row, `Esc` returns to
  the search box. `↑` from the first row goes back to the search box.
- **In the category / role filter chips:** `←`/`→` switch between chips
  (Releases / Appearances / Unofficial / Credits, or the role chips below them).
- **In YouTube's results** (left of the panel): `Tab` moves through results;
  the focused result card gets a highlighted ring. After a search the first
  result is focused automatically.

## Notes

- **Discogs API, no token.** Requests are unauthenticated, which works but is
  rate-limited (about 25 requests/minute) and returns no thumbnails. Heavy use
  may briefly hit the limit.
- **Permissions.** The extension only runs on `*.youtube.com` pages (see
  `manifest.json`). It fetches from `api.discogs.com`, which allows
  cross-origin requests.

## Testing

`test/e2e.js` is an end-to-end test that loads the unpacked extension in a real
headless Chrome and walks the full journey: typeahead search → artist select →
release list → category filter (Credits) → role sub-filter (Remixes) → activating
a release (which drives YouTube's own search). It launches and tears down its own
Chrome, and exits non-zero if any step fails.

```
npm install        # dev-only: playwright-core (no browser download)
npm run test:e2e
```

It drives a real browser against live YouTube and the Discogs API, so it needs
network and is subject to Discogs' ~25 requests/minute limit — space out runs. It
finds Chrome from `CHROME_BIN`, or from a cached Playwright Chromium at
`~/.cache/ms-playwright/chromium-<n>/chrome-linux64/chrome` (install one with
`npx playwright install chromium`).

## Project layout

The implementation is split into small single-responsibility files (each ≤160
lines). The isolated-world content scripts share one `window.YTSP` namespace:
module files register factories on it and `src/panel.js` (loaded last) wires them
together. The two `inject-*` files run in YouTube's MAIN world.

| File                     | Role                                                                  |
| ------------------------ | -------------------------------------------------------------------- |
| `manifest.json`          | Manifest V3 definition; lists the content scripts, CSS, and matches. |
| `src/config.js`          | Shared constants and the `YTSP` namespace object.                    |
| `src/roving.js`          | Generic roving-tabindex keyboard navigation for a list.             |
| `src/paging.js`          | Auto-paging (IntersectionObserver) + loading row for the releases list. |
| `src/release-row.js`     | Renders one release row.                                            |
| `src/typeahead.js`       | Artist search box: debounced Discogs lookup + suggestion dropdown.  |
| `src/filters.js`         | Category filter chips (Releases/Appearances/Unofficial/Credits).    |
| `src/subfilters.js`      | Role sub-filter chips, built from the roles present in a category.  |
| `src/releases.js`        | Loads/renders an artist's releases; runs the YouTube search.        |
| `src/other-artists.js`   | "Other artists on this release" section.                            |
| `src/panel.js`           | Builds the panel DOM, wires the modules, bootstraps.               |
| `src/inject-search.js`   | MAIN world: drives YouTube's own search box.                        |
| `src/inject-focus.js`    | MAIN world: focuses the first result + the focus-ring marker.       |
| `css/layout.css`         | Two-column page layout (YouTube + panel).                           |
| `css/panel.css`          | Panel container, theme variables, input, suggestions.              |
| `css/releases.css`       | Releases list, loading spinner, other-artists section.            |
| `css/yt-results-focus.css` | Keyboard focus ring for YouTube's own results.                   |
| `icons/`                 | Toolbar/extension icons.                                            |
| `test/e2e.js`            | End-to-end test of the full panel journey (headless Chrome).       |
| `package.json`           | Dev tooling only (the `test:e2e` script + playwright-core).        |
