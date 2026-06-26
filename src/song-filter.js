// Text filter for the loaded releases: client-side, case-insensitive substring
// match on titles — no network. Narrows what releases.js renders from its cache
// (it calls test()/query()); typing here asks it to rebuild. Owns its input.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /** @param {Ctx} ctx */
  YTSP.createSongFilter = function (ctx) {
    const { els } = ctx;
    const input = els.songFilter;
    let raw = ""; // trimmed query, verbatim for the status line
    let needle = ""; // lowercased query, for matching

    input.addEventListener("input", () => {
      raw = input.value.trim();
      needle = raw.toLowerCase();
      ctx.releases.setFilter();
    });

    input.addEventListener("keydown", (event) => {
      // ArrowDown drops focus into the releases list, like the artist box.
      if (event.key === "ArrowDown" && els.releases.children.length) {
        event.preventDefault();
        ctx.releases.focusFirst();
      } else if (event.key === "Escape" && needle) {
        // Clear the filter without leaving the box.
        event.preventDefault();
        input.value = "";
        raw = "";
        needle = "";
        ctx.releases.setFilter();
      }
    });

    return {
      // Does a title pass? An empty filter passes all.
      test: (title) => !needle || (title || "").toLowerCase().includes(needle),
      // Active query (verbatim) for status messages; "" when inactive.
      query: () => raw,
      reset: () => {
        raw = "";
        needle = "";
        input.value = "";
      },
    };
  };
})();
