// MAIN-world half of the search bridge: listens for the panel's request, runs
// the search (inject-search.js), then moves keyboard focus to the first result.
(function () {
  "use strict";

  const NS = /** @type {any} */ (window.__ytSearchPanelInject = window.__ytSearchPanelInject || {});

  // Search-result item types. yt-lockup-view-model is the newer card (playlists,
  // "Mix") that can top the list — include it to focus the true first item.
  const RESULT_ITEMS =
    "ytd-video-renderer, ytd-playlist-renderer, ytd-channel-renderer, " +
    "ytd-radio-renderer, ytd-movie-renderer, yt-lockup-view-model";

  // First result item (null if results aren't up yet).
  function firstResultItem() {
    const root = document.querySelector("ytd-search") || document;
    return root.querySelector(RESULT_ITEMS);
  }

  // First result's focusable link: title link, else thumbnail / any link.
  /** @returns {HTMLElement | null} */
  function firstResultLink() {
    const item = firstResultItem();
    if (!item) return null;
    return /** @type {HTMLElement | null} */ (
      item.querySelector("a#video-title-link") ||
      item.querySelector("a#video-title") ||
      item.querySelector("a#thumbnail") ||
      item.querySelector("a[href]")
    );
  }

  // Focus is "loose" when not on a search result (body, a button, the search
  // box) — where YouTube drops it while rebuilding the results list.
  function focusIsOnResult() {
    return !!document.activeElement?.closest?.(RESULT_ITEMS);
  }

  // Class yt-results-focus.css turns into a focus ring. We focus programmatically,
  // but :focus-visible only kicks in when the last *trusted* input was a key —
  // our search uses synthetic events, so tag the card to force the ring on.
  const KBD_FOCUS_CLASS = "yt-panel-kbd-focus";

  // focusFirstResult polling (see its comment for why it polls).
  const POLL_MS = 150; // focus re-check interval after the search fires
  const STABLE_MS = 1200; // first result unchanged + focused this long ⇒ done
  const TIMEOUT_MS = 6000; // give up regrabbing focus after this

  function clearKbdFocusMark() {
    // Snapshot the live collection so removal doesn't shift it mid-loop.
    for (const el of [...document.getElementsByClassName(KBD_FOCUS_CLASS)]) {
      el.classList.remove(KBD_FOCUS_CLASS);
    }
  }

  // Mark the focused link's card; drop it on blur so it acts like a focus ring.
  function markKbdFocus(link) {
    const item = link.closest(RESULT_ITEMS);
    if (!item) return;
    clearKbdFocusMark();
    item.classList.add(KBD_FOCUS_CLASS);
    link.addEventListener("blur", () => item.classList.remove(KBD_FOCUS_CLASS), {
      once: true,
    });
  }

  let pendingTimer = null;

  // After the search navigates to /results, focus the first result. Can't focus
  // just once: on results→results the old results linger, get focused, then are
  // destroyed (focus falls to a button), and new results render in steps. So we
  // poll: whenever focus falls loose, (re)grab the first result; stop once it's
  // stable and focused for a beat, or after 6 s. `startHref` gates us until the
  // nav happens, so we don't act on the old page.
  function focusFirstResult(startHref) {
    if (pendingTimer) clearInterval(pendingTimer);
    clearKbdFocusMark(); // drop any ring from a previous search
    const deadline = Date.now() + TIMEOUT_MS;
    let lastItem = null;
    let lastChange = Date.now();

    function done() {
      clearInterval(pendingTimer);
      pendingTimer = null;
    }

    function tick() {
      if (Date.now() > deadline) return done();
      if (location.pathname !== "/results" || location.href === startHref) return;

      const item = firstResultItem();
      if (!item) return; // results not rendered yet
      if (item !== lastItem) {
        lastItem = item; // the first-result node changed (list rebuilt)
        lastChange = Date.now();
      }

      if (!focusIsOnResult()) {
        const link = firstResultLink();
        if (link) {
          link.focus();
          markKbdFocus(link);
        }
      } else if (Date.now() - lastChange > STABLE_MS) {
        // First result stable and focused — done.
        done();
      }
    }

    pendingTimer = setInterval(tick, POLL_MS);
    tick();
  }

  document.addEventListener("yt-search-panel-run", () => {
    const query = document.documentElement.getAttribute(
      "data-yt-search-panel-query"
    );
    if (!query) return;

    const startHref = location.href;
    if (NS.runYouTubeSearch(query)) {
      focusFirstResult(startHref);
    } else {
      // Fallback: full-page nav if the search box is missing (unexpected DOM).
      window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }
  });
})();
