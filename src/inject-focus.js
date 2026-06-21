// MAIN-world half of the search bridge: listens for the panel's request, runs
// the search (inject-search.js), then moves keyboard focus to the first result.
(function () {
  "use strict";

  const NS = (window.__ytSearchPanelInject = window.__ytSearchPanelInject || {});

  // Search-result item types. yt-lockup-view-model is YouTube's newer card,
  // used for playlists and "Mix" entries that can sit at the very top of the
  // results — include it so we focus the genuine first item, not the first video.
  const RESULT_ITEMS =
    "ytd-video-renderer, ytd-playlist-renderer, ytd-channel-renderer, " +
    "ytd-radio-renderer, ytd-movie-renderer, yt-lockup-view-model";

  // The first search-result item element (or null if results aren't up yet).
  function firstResultItem() {
    const root = document.querySelector("ytd-search") || document;
    return root.querySelector(RESULT_ITEMS);
  }

  // The first result's focusable link. Prefer the title link, fall back to the
  // thumbnail / any link.
  function firstResultLink() {
    const item = firstResultItem();
    if (!item) return null;
    return (
      item.querySelector("a#video-title-link") ||
      item.querySelector("a#video-title") ||
      item.querySelector("a#thumbnail") ||
      item.querySelector("a[href]")
    );
  }

  // Focus is "loose" when it's not sitting on a search result — i.e. on <body>,
  // a toolbar button, the search box, etc. YouTube drops focus to such an
  // element while it rebuilds the results list.
  function focusIsOnResult() {
    return !!document.activeElement?.closest?.(RESULT_ITEMS);
  }

  // Class that yt-results-focus.css turns into a focus ring. We move focus here
  // programmatically, and the browser only treats programmatic focus as
  // ":focus-visible" when the last *trusted* input was a keystroke — our search
  // is driven by synthetic events, so the ring wouldn't show until the user
  // pressed another key. Tagging the card forces it on immediately.
  const KBD_FOCUS_CLASS = "yt-panel-kbd-focus";

  // focusFirstResult polling (see its comment for why it polls rather than
  // focusing once).
  const POLL_MS = 150; // re-check focus this often after the search fires
  const STABLE_MS = 1200; // first result unchanged + focused this long ⇒ done
  const TIMEOUT_MS = 6000; // give up regrabbing focus after this

  function clearKbdFocusMark() {
    // Snapshot the live collection so removing the class doesn't shift it mid-loop.
    for (const el of [...document.getElementsByClassName(KBD_FOCUS_CLASS)]) {
      el.classList.remove(KBD_FOCUS_CLASS);
    }
  }

  // Mark the focused link's card, and drop the mark on blur so it behaves
  // exactly like a focus ring (gone the moment focus moves elsewhere).
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

  // After the in-page search navigates to /results, move keyboard focus to the
  // first result. We can't just focus once: on a results→results search the
  // previous query's results linger in the DOM, get focused, then are destroyed
  // (dropping focus onto a button), and the new results render in several steps.
  // So we poll: whenever focus has fallen loose, (re)grab the current first
  // result; stop once it's been stable and focused for a beat, or after 6 s.
  // `startHref` (URL before the search) gates us until the navigation happens,
  // so we don't act on the old page.
  function focusFirstResult(startHref) {
    if (pendingTimer) clearInterval(pendingTimer);
    clearKbdFocusMark(); // drop any ring left over from a previous search
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
        // First result stable and focus sitting on a result — we're done.
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
      // Fall back to a normal navigation if YouTube's search box isn't present
      // (unexpected DOM) so search still works, just with a reload.
      window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }
  });
})();
