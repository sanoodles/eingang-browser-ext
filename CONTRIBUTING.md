# Contributing

## Development

There's no build step — the extension source loads as-is. To run it:

1. `npm install` (dev-only: `playwright-core`, used by the test).
2. At `chrome://extensions`, turn on **Developer mode** → **Load unpacked** → this
   folder (the one with `manifest.json`).
3. After editing any file (JS *or* CSS), reload the extension card (↻), then reload
   the YouTube tab.

Run the end-to-end test with `npm run test:e2e`. It drives headless Chrome against
**live** YouTube + Discogs, so it's rate-limited and occasionally flaky.

## Releasing

One command bumps the version and builds the zip; you then upload that zip to the
Chrome Web Store by hand.

```bash
npm run release             # bump inferred from commits since the last tag
BUMP=minor npm run release  # force it (also BUMP=major, BUMP=patch, or BUMP=2.0.0)
```

The bump type defaults to what `scripts/recommend-bump.js` reads off the
[Conventional Commits](https://www.conventionalcommits.org/) since the last `v*`
tag — a breaking change (`!` in the header or a `BREAKING CHANGE:` footer) gives
**major**, a `feat` gives **minor**, anything else **patch**. Set `BUMP` to
override. It runs, in order:

1. **`npm version`** — bumps `package.json`, then (in the `version` lifecycle
   hook) syncs the version into `manifest.json` and prepends the release notes to
   `CHANGELOG.md`, before committing and tagging. The notes are built from the
   Conventional Commits since the last tag, grouped by type (`feat` → Features,
   `fix` → Bug Fixes, …) with breaking changes on top. **Commits with a
   non-conventional message are deliberately left out** — that's how to keep
   something off the changelog. Skim the generated entry and tidy it if needed
   (the bump commit isn't pushed yet, so you can `git commit --amend`).
2. **`npm run build`** — zips the extension into `dist/eingang-<version>.zip`.

The commit and tag stay **local**. Then ship the build manually:

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and select the **Eingang** item.
2. Under **Package**, choose **Upload new package** and pick the freshly built
   `dist/eingang-<version>.zip`.
3. Review the listing if needed, then **Submit for review**. Publishing submits
   the new version for Google's review; it does not go live instantly.
4. Once it's accepted, push the release commit and tag:

   ```bash
   git push --follow-tags
   ```

`npm run build` on its own (no version bump) re-zips the current version if you
need to re-upload.
