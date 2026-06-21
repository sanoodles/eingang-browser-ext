// Shared constants, small shared helpers, and the YTSP namespace. Every
// content-script file runs in the same isolated world and communicates through
// this one global object: module files register factories on it, and panel.js
// wires them together.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

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
   * stores each factory's result back onto it; modules reach siblings lazily
   * through it, so they're all present by the time any event fires.
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

  /** @type {Cfg} */
  YTSP.config = {
    PANEL_ID: "yt-search-panel-ext",
    DEBOUNCE_MS: 500,
    MIN_QUERY_LEN: 2,
    MAX_RESULTS: 8,
    // Panel sizing (panel-chrome.js). The width is applied as the
    // `--yt-panel-width` custom property on <html>, which both panel.css (the
    // panel's flex-basis) and layout.css (the masthead's right inset) read.
    PANEL_DEFAULT_WIDTH: 400,
    PANEL_MIN_WIDTH: 280,
    PANEL_MAX_WIDTH: 760,
    PANEL_MIN_KEEP: 480, // keep at least this much page width for YouTube
    // chrome.storage.local keys for the persisted width / collapsed state.
    STORE_WIDTH: "ytspWidth",
    STORE_COLLAPSED: "ytspCollapsed",
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

  // Discogs decorates artist names with a "(2)" disambiguator and a trailing "*"
  // (anti-vanity marker); strip both for searching and display. Shared by
  // releases.js and other-artists.js so the rule lives in one place.
  /** @param {string} [name] @returns {string} */
  YTSP.cleanArtistName = function (name) {
    return (name || "").replace(/\s*\(\d+\)|\*/g, "").trim();
  };

  // Discogs uses "Various" as the placeholder artist on compilations — treat it
  // as "no specific artist".
  /** @param {string} [name] @returns {boolean} */
  YTSP.isVarious = function (name) {
    return /^various$/i.test((name || "").trim());
  };
})();
