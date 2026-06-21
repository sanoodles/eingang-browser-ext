# Privacy Policy

**Extension:** Eingang: Discogs releases for YouTube
**Last updated:** 21 June 2026

This extension does not collect, store, sell, or share any personal information,
and it sends nothing to the developer. There are no accounts, no analytics, no
tracking, no advertising, and no remote code.

## What the extension processes

- **Artist searches you type.** When you type in the panel, the text is sent to
  the Discogs API (`api.discogs.com`) to fetch matching artists and their
  releases. This request goes directly from your browser to Discogs; it is not
  routed through the developer. Discogs' handling of it is governed by Discogs'
  own privacy policy: https://www.discogs.com/legal/privacy-policy
- **Release selections.** Clicking a release fills YouTube's own search box and
  runs a search. This stays within the YouTube page you are already on and is
  subject to YouTube's normal data handling: https://policies.google.com/privacy
- **Your panel preferences.** The panel's width and whether it is collapsed are
  saved locally on your device (the browser's extension storage) so the panel
  reopens the way you left it. This is not personal data and is never transmitted.

## What it does not do

- No data is transmitted to the developer or to any third party other than the
  Discogs API request described above.
- No personal data (identity, location, browsing history) is read or collected.
- No cookies are set by the extension.
- Nothing else is stored: release and search data live only in the page's memory
  while the tab is open and are discarded when you close or reload it. The only
  saved value is the local panel-layout preference described above.

## Permissions

The extension runs only on `*.youtube.com` pages and uses the `storage`
permission to save your panel-layout preference locally on your device (both
declared in `manifest.json`). Its network access is limited to fetching public
data from `api.discogs.com`.

## Contact

Questions: samuelgomezcrespo@gmail.com

## Changes

Any future change to this policy will appear in this file with an updated
"Last updated" date.
