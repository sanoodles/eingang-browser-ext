# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the notes are generated from
[Conventional Commits](https://www.conventionalcommits.org/) — a commit written
without a conventional type is intentionally left out. The 1.0.0 and 1.1.0
entries predate that workflow and were written by hand.

## [1.1.0] - 2026-06-21

### Features

- **panel:** collapse/expand toggle plus a draggable left edge to resize the panel; width and collapsed state persist ([`18e29c2`](https://github.com/sanoodles/eingang-browser-ext/commit/18e29c2))
- **typeahead:** loading spinner while the Discogs lookup is in flight ([`84a0b9b`](https://github.com/sanoodles/eingang-browser-ext/commit/84a0b9b))

### Refactoring

- Modernize the source to ES2022 and add JSDoc types ([`ec93562`](https://github.com/sanoodles/eingang-browser-ext/commit/ec93562), [`042b862`](https://github.com/sanoodles/eingang-browser-ext/commit/042b862))

### Tests

- Cover keyboard navigation of the dropdown and list, plus panel collapse, resize, and persistence ([`98bdce4`](https://github.com/sanoodles/eingang-browser-ext/commit/98bdce4), [`cd5a62d`](https://github.com/sanoodles/eingang-browser-ext/commit/cd5a62d))

### Build

- Add npm scripts to bump, build, and package a release ([`8852b84`](https://github.com/sanoodles/eingang-browser-ext/commit/8852b84))

## [1.0.0] - 2026-06-17

### Features

- Initial release: a YouTube side panel that searches the Discogs API for an artist, lists their releases, and clicks one to drive YouTube's own search and focus the first result ([`44450e9`](https://github.com/sanoodles/eingang-browser-ext/commit/44450e9))
- Text filter to narrow the release list by title ([`b8ac6be`](https://github.com/sanoodles/eingang-browser-ext/commit/b8ac6be))
- Feedback link in the panel ([`38b62e5`](https://github.com/sanoodles/eingang-browser-ext/commit/38b62e5))

### Bug Fixes

- Render the panel above YouTube's popup menus instead of behind them ([`a37d284`](https://github.com/sanoodles/eingang-browser-ext/commit/a37d284))
