// Releases list: loads an artist's releases from Discogs (newest first), caches
// them, and shows the ones in the active category (filters.js). Pages in more
// (paging.js), and keeps paging when a category's rows start only on later pages.
(function () {
  "use strict";
  const YTSP = (window.YTSP = window.YTSP || {});

  YTSP.createReleases = function (ctx) {
    const els = ctx.els;
    const cfg = ctx.cfg;
    const releases = els.releases;

    let releasesController = null;
    let releasesSeq = 0; // guards against out-of-order responses
    let currentArtistId = null;
    let currentArtistName = "";
    let nextPage = 1;
    let totalPages = 1;
    let hasMore = false; // more pages exist beyond what's loaded
    let loadingMore = false; // a page fetch is in flight (re-entrancy guard)
    let cache = []; // every release fetched for this artist, all categories

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
      if (n) setStatus(currentArtistName + " — " + label + ": " + n + (hasMore ? "+" : ""));
      else if (hasMore) setStatus("Finding " + label + " for " + currentArtistName + "…");
      else setStatus("No " + label + " found for " + currentArtistName + ".");
    }
    const paging = YTSP.createPaging({
      container: releases,
      toInput: function () { els.input.focus(); },
      canLoadMore: function () { return hasMore && !loadingMore; },
      loadMore: function () { loadReleases(false); },
    });

    function activateRelease(rel) {
      // Use the release's own credited artist (rel.artist), not the searched one
      // (they differ for productions/appearances); strip Discogs "(2)"/"*", drop "Various".
      let who = (rel.artist || "").replace(/\s*\(\d+\)|\*/g, "").trim();
      if (/^various$/i.test(who)) who = "";
      ctx.runYouTubeSearch((who + " " + (rel.title || "")).trim());
      ctx.other.showOtherArtists(rel);
    }
    // Append the items of `list` that pass both the category and role filters.
    function appendMatching(list) {
      list.forEach(function (rel) {
        if (!ctx.filters.test(rel.role) || !ctx.subfilters.test(rel.role)) return;
        const handlers = { activate: activateRelease, attach: paging.attach };
        releases.appendChild(YTSP.createReleaseRow(rel, handlers));
      });
    }
    // Keep exactly one row in the Tab order (roving promotes the active one).
    function ensureTabbable() {
      if (releases.querySelector('.yt-rel[tabindex="0"]')) return;
      const first = releases.querySelector(".yt-rel");
      if (first) first.tabIndex = 0;
    }
    // Keep paging while the active filters show too few rows and pages remain —
    // walks to a category/role that only appears later (Discogs blocks are ordered).
    function fillIfHungry() {
      if (hasMore && !loadingMore && shownCount() < cfg.RELEASES_FILL_MIN) loadReleases(false);
    }
    // Rebuild the visible list from the cache for the now-active filters (instant).
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
      paging.observeLast(false); // stop watching the previous artist's last row
      ctx.other.clearOtherArtists(); // previous release's collaborators are stale
      ctx.filters.reset(); // a new artist starts on the Releases filter
      ctx.subfilters.reset();
      els.filters.hidden = false;
      loadReleases(true);
    }

    function loadReleases(reset) {
      if (releasesController) releasesController.abort();
      releasesController = new AbortController();
      const seq = ++releasesSeq;
      const page = nextPage;
      const url =
        cfg.DISCOGS_ARTISTS + "/" + currentArtistId + "/releases" +
        "?sort=year&sort_order=desc&per_page=" + cfg.RELEASES_PER_PAGE +
        "&page=" + page;

      // Block auto-load triggers (scroll/focus) while this page is in flight.
      loadingMore = true;
      if (reset) setStatus("Loading releases for " + currentArtistName + "…");
      else paging.showLoadingRow(true);

      fetch(url, { signal: releasesController.signal })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (seq !== releasesSeq) return; // superseded by a newer selection
          paging.showLoadingRow(false); // remove before appending so it stays last
          const list = data.releases || [];
          const pag = data.pagination || {};
          totalPages = pag.pages || 1;
          cache = cache.concat(list);
          appendMatching(list);
          ensureTabbable();
          ctx.subfilters.setFromCache(cache, ctx.filters.test);
          hasMore = page < totalPages;
          if (hasMore) nextPage = page + 1;
          loadingMore = false;
          paging.observeLast(hasMore);
          updateStatus();
          fillIfHungry();
        })
        .catch(function (err) {
          if (err.name === "AbortError" || seq !== releasesSeq) return;
          paging.showLoadingRow(false);
          loadingMore = false;
          // Keep hasMore so a later scroll/focus can retry, but don't re-observe
          // (an already-visible last row would retry-loop instantly).
          hasMore = page < totalPages;
          setStatus(
            (reset ? "Couldn't load releases (" : "Couldn't load more (") + err.message + ")."
          );
        });
    }

    return {
      selectArtist: selectArtist,
      setFilter: setFilter,
      rove: paging.rove,
      firstTabbable: paging.firstTabbable,
      artistName: function () { return currentArtistName; },
    };
  };
})();
