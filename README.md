# Eingang: Discogs releases for YouTube

A Chrome extension that adds a full-height side panel to YouTube. Type an artist
into the panel's [Discogs](https://www.discogs.com) typeahead, browse their
releases (newest first), and click one to run an in-page YouTube search for it.

*Unofficial — not affiliated with, endorsed by, or sponsored by YouTube or Discogs.*

## What it does

- **Artist typeahead** — type a name; matching Discogs artists appear in a dropdown.
- **Releases list** — pick an artist to list their releases; more pages load as you scroll.
- **Category filter** — chips narrow the list to **Releases**, **Appearances**,
  **Unofficial**, or **Credits** (the buckets Discogs uses on an artist page).
- **Role sub-filter** — a second chip row narrows the category by role (e.g.
  Credits → Remixes / Production), built from the roles actually present.
- **Text filter** — a box that narrows the list to titles containing what you type.
- **Search YouTube** — clicking a release drives YouTube's own search box (no full
  reload) and focuses the first result, searching under the release's credited artist.
- **Other artists** — a release also lists its other headline artists; click one to search it.
- **Resize & collapse** — drag the panel's left edge to set its width, or collapse
  it to a tab on the page edge; your width and collapsed state are remembered.

## Install

It's unpublished, so load the source folder directly ("load unpacked") in any
Chromium browser (Chrome, Edge, Brave). Nothing to build.

1. Open `chrome://extensions` (or `edge://`, `brave://`) and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder (the one with `manifest.json`).
3. Open or reload a `youtube.com` tab — the panel appears on the right.

## Using the panel

Type an artist (≥2 characters), pick one from the dropdown, then click a release.
YouTube searches for `<release artist> <release title>` and focuses the first
result; a compilation's `Various` is dropped, leaving just the title.

### Keyboard

- **Search box:** `↑`/`↓` move through suggestions, `Enter` selects, `Esc` closes
  the dropdown; with it closed, `↓` jumps into the releases list.
- **Lists (releases / other artists):** `↑`/`↓` move, `Home`/`End` jump, `Enter`/`Space`
  activates, `Esc` (or `↑` from the top row) returns to the search box.
- **Filter chips:** `←`/`→` switch between chips.
- **Resize grip:** focus the panel's left edge, then `←`/`→` to resize (`Shift` for bigger steps).
- **Text filter box:** type to narrow, `↓` jumps into the list, `Esc` clears it.
- **YouTube's results:** `Tab` moves through them; the focused card gets a ring.

## Notes

- **Discogs API.** Requests are unauthenticated and rate-limited (~25/minute), so
  heavy use may briefly hit the limit.
- **Permissions.** Runs only on `*.youtube.com`; fetches from `api.discogs.com`;
  uses local `storage` to remember the panel's width and collapsed state.
- **Privacy.** No data is collected or sent to the developer. See [PRIVACY.md](PRIVACY.md).
- **Feedback.** The *Send feedback* link at the bottom of the panel opens a
  pre-addressed email to the developer.
