// Releases list: loads an artist's releases from Discogs (newest first), caches
// them, shows the active category (filters.js). Pages in more (paging.js), and
// keeps paging when a category's rows start only on later pages.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /** @param {Ctx} ctx */
  YTSP.createReleases = function (ctx) {
    const { els, cfg } = ctx;
    const releases = els.releases;

    let releasesController = null;
    let releasesSeq = 0; // guards against out-of-order responses
    let currentArtistId = null;
    let currentArtistName = "";
    let nextPage = 1;
    let totalPages = 1;
    let hasMore = false; // pages exist beyond what's loaded
    let loadingMore = false; // page fetch in flight (re-entrancy guard)
    let cache = []; // every release fetched for this artist

    function setStatus(text) {
      els.status.textContent = text || "";
      els.status.hidden = !text;
    }
    function shownCount() {
      return releases.querySelectorAll(".yt-rel").length;
    }
    function updateStatus() {
      const n = shownCount();
      const label = ctx.filters.activeLabel();
      const q = ctx.songFilter.query();
      if (n) setStatus(`${currentArtistName} — ${label}: ${n}${hasMore ? "+" : ""}`);
      else if (hasMore) setStatus(`Finding ${label} for ${currentArtistName}…`);
      else if (q) setStatus(`No ${label} matching “${q}”.`);
      else setStatus(`No ${label} found for ${currentArtistName}.`);
    }
    const paging = YTSP.createPaging({
      container: releases,
      toInput: () => els.input.focus(),
      canLoadMore: () => hasMore && !loadingMore,
      loadMore: () => loadReleases(false),
    });

    function activateRelease(rel) {
      // Use the release's own credited artist (differs from the searched one for
      // productions/appearances); clean it, then drop "Various".
      let who = YTSP.cleanArtistName(rel.artist);
      if (YTSP.isVarious(who)) who = "";
      ctx.runYouTubeSearch(`${who} ${rel.title || ""}`.trim());
      ctx.other.showOtherArtists(rel);
    }
    // Append the items of `list` that pass the category, role, and text filters.
    function appendMatching(list) {
      const handlers = { activate: activateRelease, attach: paging.attach };
      for (const rel of list) {
        if (!ctx.filters.test(rel.role) || !ctx.subfilters.test(rel.role)) continue;
        if (!ctx.songFilter.test(rel.title)) continue;
        releases.appendChild(YTSP.createReleaseRow(rel, handlers));
      }
    }
    // Keep exactly one row in the Tab order (roving promotes the active one).
    function ensureTabbable() {
      if (releases.querySelector('.yt-rel[tabindex="0"]')) return;
      const first = /** @type {HTMLElement | null} */ (releases.querySelector(".yt-rel"));
      if (first) first.tabIndex = 0;
    }
    // Page on while the active filters show too few rows and pages remain, to
    // reach a category/role that only appears later (Discogs blocks are ordered).
    function fillIfHungry() {
      if (hasMore && !loadingMore && shownCount() < cfg.RELEASES_FILL_MIN) loadReleases(false);
    }
    // Rebuild the visible list from the cache for the active filters (instant).
    function setFilter() {
      releases.replaceChildren();
      releases.scrollTop = 0;
      appendMatching(cache);
      ensureTabbable();
      ctx.subfilters.setFromCache(cache, ctx.filters.test);
      paging.observeLast(hasMore);
      updateStatus();
      fillIfHungry();
    }
    function selectArtist(item) {
      if (!item || !item.id) return;
      els.input.value = item.name;
      ctx.typeahead.closeSuggestions();
      currentArtistId = item.id;
      currentArtistName = item.name;
      nextPage = 1;
      totalPages = 1;
      hasMore = false;
      loadingMore = false;
      cache = [];
      releases.replaceChildren();
      paging.observeLast(false); // stop watching the old last row
      ctx.other.clearOtherArtists(); // old collaborators are stale
      ctx.filters.reset(); // new artist starts on Releases
      ctx.subfilters.reset();
      ctx.songFilter.reset(); // drop the old text filter
      els.filters.hidden = false;
      els.songFilter.hidden = false;
      loadReleases(true);
    }

    async function loadReleases(reset) {
      releasesController?.abort();
      releasesController = new AbortController();
      const seq = ++releasesSeq;
      const page = nextPage;
      const url = `${cfg.DISCOGS_ARTISTS}/${currentArtistId}/releases?sort=year&sort_order=desc&per_page=${cfg.RELEASES_PER_PAGE}&page=${page}`;

      // Block auto-load triggers (scroll/focus) while this page is in flight.
      loadingMore = true;
      if (reset) setStatus(`Loading releases for ${currentArtistName}…`);
      else paging.showLoadingRow(true);

      try {
        const res = await fetch(url, { signal: releasesController.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (seq !== releasesSeq) return; // superseded by a newer selection
        paging.showLoadingRow(false); // remove first so it stays last after append
        const list = data.releases || [];
        totalPages = data.pagination?.pages || 1;
        cache = [...cache, ...list];
        appendMatching(list);
        ensureTabbable();
        ctx.subfilters.setFromCache(cache, ctx.filters.test);
        hasMore = page < totalPages;
        if (hasMore) nextPage = page + 1;
        loadingMore = false;
        paging.observeLast(hasMore);
        updateStatus();
        fillIfHungry();
      } catch (err) {
        if (err.name === "AbortError" || seq !== releasesSeq) return;
        paging.showLoadingRow(false);
        loadingMore = false;
        // Keep hasMore so a later scroll/focus can retry, but don't re-observe
        // (a visible last row would retry-loop instantly).
        hasMore = page < totalPages;
        setStatus(`Couldn't load ${reset ? "releases" : "more"} (${err.message}).`);
      }
    }

    return {
      selectArtist,
      setFilter,
      // Focus the list's first row (ArrowDown from the artist box / text filter).
      focusFirst: () => paging.rove(paging.firstTabbable()),
      artistName: () => currentArtistName,
    };
  };
})();
