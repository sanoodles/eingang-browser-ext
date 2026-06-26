// Shared constants, helpers, and the YTSP namespace — the one global every
// content-script module registers factories on; panel.js wires them together.
// JSDoc typedefs (Cfg/Els/Release/Ctx) sit at file top level (below the IIFE)
// so they're global; `npm run typecheck` enforces them.
(function () {
  "use strict";

  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /** @type {Cfg} */
  YTSP.config = {
    PANEL_ID: "yt-search-panel-ext",
    DEBOUNCE_MS: 500,
    MIN_QUERY_LEN: 2,
    MAX_RESULTS: 8,
    // Panel sizing (panel-chrome.js); width → `--yt-panel-width` on <html>,
    // read by panel.css (flex-basis) and layout.css (masthead inset).
    PANEL_DEFAULT_WIDTH: 400,
    PANEL_MIN_WIDTH: 280,
    PANEL_MAX_WIDTH: 760,
    PANEL_MIN_KEEP: 480, // min page width to leave YouTube
    // Persisted-state keys (chrome.storage.local).
    STORE_WIDTH: "ytspWidth",
    STORE_COLLAPSED: "ytspCollapsed",
    RELEASES_PER_PAGE: 100, // Discogs API max per page
    // Auto-page until at least this many rows match the active filter, so rows
    // that only appear on later pages still fill in.
    RELEASES_FILL_MIN: 12,
    // Discogs API. No token: works, but ~25 req/min and no thumbnails. CORS is
    // open, so fetching from the youtube.com page works.
    DISCOGS_SEARCH: "https://api.discogs.com/database/search",
    DISCOGS_ARTISTS: "https://api.discogs.com/artists",
  };

  // Strip Discogs' "(2)" disambiguator and trailing "*" (anti-vanity marker)
  // from artist names, for search and display.
  /** @param {string} [name] @returns {string} */
  YTSP.cleanArtistName = function (name) {
    return (name || "").replace(/\s*\(\d+\)|\*/g, "").trim();
  };

  // "Various" is Discogs' placeholder artist on compilations — i.e. no artist.
  /** @param {string} [name] @returns {boolean} */
  YTSP.isVarious = function (name) {
    return /^various$/i.test((name || "").trim());
  };
})();

// --- Shared JSDoc typedefs --------------------------------------------------
// At file top level (after the IIFE, nothing following) so they're global and
// don't bind to a function below.

/**
 * Tunable constants, read across panel.js / panel-chrome.js / releases.js.
 * @typedef {Object} Cfg
 * @property {string} PANEL_ID
 * @property {number} DEBOUNCE_MS
 * @property {number} MIN_QUERY_LEN
 * @property {number} MAX_RESULTS
 * @property {number} PANEL_DEFAULT_WIDTH
 * @property {number} PANEL_MIN_WIDTH
 * @property {number} PANEL_MAX_WIDTH
 * @property {number} PANEL_MIN_KEEP
 * @property {string} STORE_WIDTH
 * @property {string} STORE_COLLAPSED
 * @property {number} RELEASES_PER_PAGE
 * @property {number} RELEASES_FILL_MIN
 * @property {string} DISCOGS_SEARCH
 * @property {string} DISCOGS_ARTISTS
 */

/**
 * A Discogs artist-releases list item — only the fields the panel reads.
 * @typedef {Object} Release
 * @property {number} [id]
 * @property {string} [title]
 * @property {(number|string)} [year]
 * @property {string} [type]   Discogs entry type (master, release, …)
 * @property {string} [role]   Discogs role bucket (Main, Remix, Appearance, …)
 * @property {string} [format]
 * @property {string} [label]
 * @property {string} [artist] credited artist(s), a " / "-joined string
 */

/**
 * The DOM elements panel.js builds and shares with every module via ctx.els.
 * @typedef {Object} Els
 * @property {HTMLInputElement} input
 * @property {HTMLUListElement} suggestions
 * @property {HTMLDivElement} spinner
 * @property {HTMLDivElement} filters
 * @property {HTMLDivElement} subfilters
 * @property {HTMLInputElement} songFilter
 * @property {HTMLDivElement} status
 * @property {HTMLUListElement} releases
 * @property {HTMLDivElement} otherHeading
 * @property {HTMLUListElement} others
 * @property {HTMLDivElement} resizeHandle
 * @property {HTMLButtonElement} collapseBtn
 * @property {HTMLButtonElement} reopenBtn
 */

/**
 * The wiring object every module factory receives. panel.js builds it, then
 * stores each factory's result back onto it; modules reach siblings lazily, so
 * all are present by the time any event fires.
 * @typedef {Object} Ctx
 * @property {Els} els
 * @property {Cfg} cfg
 * @property {(text: string) => void} runYouTubeSearch
 * @property {ReturnType<typeof YTSP.createPanelChrome>} chrome
 * @property {ReturnType<typeof YTSP.createTypeahead>} typeahead
 * @property {ReturnType<typeof YTSP.createReleases>} releases
 * @property {ReturnType<typeof YTSP.createFilters>} filters
 * @property {ReturnType<typeof YTSP.createSubfilters>} subfilters
 * @property {ReturnType<typeof YTSP.createSongFilter>} songFilter
 * @property {ReturnType<typeof YTSP.createOtherArtists>} other
 */
