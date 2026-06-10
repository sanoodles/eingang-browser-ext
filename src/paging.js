// Automatic paging for the releases list: an IntersectionObserver on the last
// row (root = the scrollable list) fires when you scroll near the bottom, and a
// roving onRove hook fires the same path when keyboard focus lands on the last
// row. Also owns the inline "loading more…" spinner row. Built on roving.js.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

  // opts: { container, toInput, canLoadMore, loadMore }
  //   canLoadMore() -> bool (more pages exist and none is in flight)
  //   loadMore()    -> fetch the next page
  YTSP.createPaging = function (opts) {
    const container = opts.container;
    let observedLast = null;

    // The last actual release row. The transient loading row is the list's last
    // *child* while a page is in flight, but it isn't a release, so paging and
    // keyboard nav must look past it.
    function lastRow() {
      const rows = container.querySelectorAll(".yt-rel");
      return rows.length ? rows[rows.length - 1] : null;
    }

    function maybeLoadMore() {
      if (opts.canLoadMore()) opts.loadMore();
    }

    const roving = YTSP.createRoving({
      container: container,
      rowClass: "yt-rel",
      toInput: opts.toInput,
      // Focusing the last loaded row pulls in the next page — the keyboard
      // equivalent of scrolling to the bottom.
      onRove: function (li) {
        if (li === lastRow()) maybeLoadMore();
      },
    });

    // Inline "loading more…" row, in the DOM only while a follow-up page loads.
    const loadingRow = document.createElement("li");
    loadingRow.className = "yt-rel-loading";
    loadingRow.setAttribute("aria-hidden", "true"); // status line carries meaning
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
      function (entries) {
        if (
          entries.some(function (e) {
            return e.isIntersecting;
          })
        ) {
          maybeLoadMore();
        }
      },
      { root: container, rootMargin: "150px" }
    );

    // Watch the current last row, or detach when there's nothing more to load.
    // The observer reports an element's initial state on observe(), so if the
    // last row is already on screen this auto-fills the next page too.
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
      showLoadingRow: showLoadingRow,
      observeLast: observeLast,
      firstTabbable: firstTabbable,
    };
  };
})();
