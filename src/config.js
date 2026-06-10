// Shared constants and the YTSP namespace. Every content-script file runs in the
// same isolated world and communicates through this one global object: module
// files register factories on it, and panel.js wires them together.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

  YTSP.config = {
    PANEL_ID: "yt-search-panel-ext",
    DEBOUNCE_MS: 500,
    MIN_QUERY_LEN: 2,
    MAX_RESULTS: 8,
    RELEASES_PER_PAGE: 100, // Discogs API max per page
    // Keep auto-paging until at least this many rows match the active category
    // filter, so a category whose rows only appear on later pages still fills in.
    RELEASES_FILL_MIN: 12,
    // Discogs API. No token: works, but rate-limited to 25 req/min and returns
    // no thumbnails. CORS is open (access-control-allow-origin: *), so fetching
    // from the youtube.com page context is allowed.
    DISCOGS_SEARCH: "https://api.discogs.com/database/search",
    DISCOGS_ARTISTS: "https://api.discogs.com/artists",
  };
})();
