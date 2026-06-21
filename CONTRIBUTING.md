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

One command bumps the version, builds the zip, and publishes to the Chrome Web
Store:

```bash
npm run release             # patch: 1.1.0 -> 1.1.1
BUMP=minor npm run release  # 1.1.0 -> 1.2.0   (also BUMP=major, or BUMP=2.0.0)
```

It runs, in order:

1. **`npm version`** — bumps `package.json`, syncs the same version into
   `manifest.json` (the `version` lifecycle hook), then commits and tags.
2. **`npm run build`** — zips the extension into `dist/eingang-<version>.zip`.
3. **`npm run ship`** — uploads that zip to the Chrome Web Store and publishes it.

The commit and tag stay **local** — push them after a successful release:

```bash
git push --follow-tags
```

Publishing **submits the new version for Google's review**; it does not go live
instantly. You can also run the steps separately: `npm run build`, then
`npm run ship`.

### Chrome Web Store credentials

`npm run ship` (and so `npm run release`) needs a Google OAuth client authorized
for the Chrome Web Store API, passed as environment variables:

| Variable | What it is |
| --- | --- |
| `CWS_CLIENT_ID` | OAuth 2.0 client ID |
| `CWS_CLIENT_SECRET` | OAuth 2.0 client secret |
| `CWS_REFRESH_TOKEN` | Refresh token for the `chromewebstore` scope |
| `CWS_EXTENSION_ID` | Optional; defaults to the published extension ID |

To get them once:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project and enable the **Chrome Web Store API**.
2. Create an **OAuth 2.0 Client ID** of type *Desktop app* → this gives the client
   ID and secret. On the OAuth consent screen, add your Google account as a test
   user.
3. Do a one-time consent to mint a refresh token for the scope
   `https://www.googleapis.com/auth/chromewebstore` (the
   [chrome-webstore-upload key guide](https://github.com/fregante/chrome-webstore-upload/blob/main/How%20to%20generate%20Google%20API%20keys.md)
   walks through this).

Keep the values out of git — e.g. export them from an untracked file and run:

```bash
set -a; source .env.release; set +a   # .env.release is gitignored
npm run release
```
