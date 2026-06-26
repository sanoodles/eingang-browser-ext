// Auto-paging for the releases list: an IntersectionObserver on the last row
// fires when you scroll near the bottom, and a roving onRove hook does the same
// when keyboard focus lands on it. Owns the inline "loading more…" row. Built
// on roving.js.
(function () {
  "use strict";

  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container the scrollable <ul> of release rows
   * @param {() => void} opts.toInput moves focus back up into the search box
   * @param {() => boolean} opts.canLoadMore more pages exist and none is in flight
   * @param {() => void} opts.loadMore fetch the next page
   */
  YTSP.createPaging = function (opts) {
    const container = opts.container;
    let observedLast = null;

    // The last actual release row. The transient loading row is the last *child*
    // mid-fetch but isn't a release, so paging/keyboard nav must look past it.
    function lastRow() {
      const rows = container.querySelectorAll(".yt-rel");
      return rows[rows.length - 1] ?? null;
    }

    function maybeLoadMore() {
      if (opts.canLoadMore()) opts.loadMore();
    }

    const roving = YTSP.createRoving({
      container,
      rowClass: "yt-rel",
      toInput: opts.toInput,
      // Focusing the last row pulls the next page — keyboard equivalent of
      // scrolling to the bottom.
      onRove: (li) => {
        if (li === lastRow()) maybeLoadMore();
      },
    });

    // Inline "loading more…" row, in the DOM only while a follow-up page loads.
    const loadingRow = document.createElement("li");
    loadingRow.className = "yt-rel-loading";
    loadingRow.setAttribute("aria-hidden", "true"); // status line carries the meaning
    const spinner = document.createElement("span");
    spinner.className = "yt-rel-spinner";
    const loadingLabel = document.createElement("span");
    loadingLabel.textContent = "Loading more…";
    loadingRow.appendChild(spinner);
    loadingRow.appendChild(loadingLabel);

    function showLoadingRow(show) {
      if (show) {
        if (loadingRow.parentNode !== container) container.appendChild(loadingRow);
      } else if (loadingRow.parentNode === container) {
        container.removeChild(loadingRow);
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) maybeLoadMore();
      },
      { root: container, rootMargin: "150px" }
    );

    // Watch the current last row, or detach when nothing more to load. observe()
    // reports initial state, so an already-visible last row auto-fills next page.
    function observeLast(hasMore) {
      if (observedLast) {
        io.unobserve(observedLast);
        observedLast = null;
      }
      if (!hasMore) return;
      const last = lastRow();
      if (last) {
        observedLast = last;
        io.observe(last);
      }
    }

    function firstTabbable() {
      return (
        container.querySelector('.yt-rel[tabindex="0"]') ||
        container.querySelector(".yt-rel")
      );
    }

    return {
      rove: roving.rove,
      attach: roving.attach,
      showLoadingRow,
      observeLast,
      firstTabbable,
    };
  };
})();
