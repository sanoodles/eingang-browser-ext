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
npm run release             # patch: 1.1.0 -> 1.1.1
BUMP=minor npm run release  # 1.1.0 -> 1.2.0   (also BUMP=major, or BUMP=2.0.0)
```

It runs, in order:

1. **`npm version`** — bumps `package.json`, syncs the same version into
   `manifest.json` (the `version` lifecycle hook), then commits and tags.
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
