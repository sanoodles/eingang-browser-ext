// Text filter for the loaded releases list: a client-side, case-insensitive
// substring match on release titles — no network. It narrows what releases.js
// renders from its cache; releases.js calls test()/query(), and typing here just
// asks releases to rebuild the visible list. Owns its input element's events.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /** @param {Ctx} ctx */
  YTSP.createSongFilter = function (ctx) {
    const { els } = ctx;
    const input = els.songFilter;
    let raw = ""; // trimmed query, kept verbatim for the status line
    let needle = ""; // lowercased query used for matching

    input.addEventListener("input", () => {
      raw = input.value.trim();
      needle = raw.toLowerCase();
      ctx.releases.setFilter();
    });

    input.addEventListener("keydown", (event) => {
      // ArrowDown drops focus into the releases list, like the artist box does.
      if (event.key === "ArrowDown" && els.releases.children.length) {
        event.preventDefault();
        ctx.releases.focusFirst();
      } else if (event.key === "Escape" && needle) {
        // Clear the filter (and restore the full list) without leaving the box.
        event.preventDefault();
        input.value = "";
        raw = "";
        needle = "";
        ctx.releases.setFilter();
      }
    });

    return {
      // Does a release title pass the current filter? An empty filter passes all.
      test: (title) => !needle || (title || "").toLowerCase().includes(needle),
      // The active query (verbatim), for status messages; "" when inactive.
      query: () => raw,
      reset: () => {
        raw = "";
        needle = "";
        input.value = "";
      },
    };
  };
})();
