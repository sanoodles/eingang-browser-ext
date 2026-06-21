# Eingang: Discogs releases for YouTube

A Chrome extension that adds a full-height side panel to YouTube. Type an artist
into the panel's [Discogs](https://www.discogs.com) typeahead, browse their
releases (newest first), and click one to run an in-page YouTube search for it.

*Unofficial — not affiliated with, endorsed by, or sponsored by YouTube or Discogs.*

## What it does

- **Typeahead** — type an artist; matching Discogs artists appear in a dropdown.
- **Releases** — pick one to list their releases; more pages load as you scroll.
- **Filters** — category chips (**Releases**, **Appearances**, **Unofficial**,
  **Credits**), a role sub-filter, and a title text box.
- **Search** — click a release (or one of its other headline artists) to drive
  YouTube's own search box, no reload, and focus the first result.
- **Resize & collapse** — drag the panel's left edge or collapse it to a tab; both
  are remembered.

It's fully keyboard-navigable: arrows move through suggestions, lists, and chips;
`Enter`/`Space` activate; `Esc` steps back out.

## Install

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/eingang-discogs-releases/panappbiijcinhelkocoealgmaoehiek),
then open or reload a `youtube.com` tab — the panel appears on the right.

## Notes

- **Discogs API** requests are unauthenticated and rate-limited (~25/minute).
- **Permissions:** runs only on `*.youtube.com`; fetches from `api.discogs.com`;
  uses local `storage` for width and collapsed state.
- **Privacy:** nothing is collected or sent to the developer. See [PRIVACY.md](PRIVACY.md).

## Development

Running from source, the test, and the release process are in [CONTRIBUTING.md](CONTRIBUTING.md).
