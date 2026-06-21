// Category filter chips for the releases list — Releases / Appearances /
// Unofficial / Credits — mirroring the discography filter on a Discogs artist
// page. Owns the category model: each filter tests a release's Discogs `role`.
(function () {
  "use strict";
  const YTSP = (window.YTSP = window.YTSP || {});

  // Discogs groups an artist's releases by `role`. These four buckets match the
  // Discogs artist page. Credits is the catch-all for crediting roles (Remix,
  // Producer, Written-By, …) that aren't main, an appearance, or unofficial.
  const CATS = [
    {
      id: "releases",
      label: "Releases",
      test: function (r) {
        return r === "Main";
      },
    },
    {
      id: "appearances",
      label: "Appearances",
      test: function (r) {
        return r === "Appearance" || r === "TrackAppearance";
      },
    },
    {
      id: "unofficial",
      label: "Unofficial",
      test: function (r) {
        return r === "UnofficialRelease";
      },
    },
    {
      id: "credits",
      label: "Credits",
      test: function (r) {
        return (
          r !== "Main" &&
          r !== "Appearance" &&
          r !== "TrackAppearance" &&
          r !== "UnofficialRelease"
        );
      },
    },
  ];
  const DEFAULT_ID = "releases";

  YTSP.createFilters = function (ctx) {
    const bar = ctx.els.filters;
    let activeId = DEFAULT_ID;
    const buttons = {};

    function find(id) {
      return (
        CATS.find(function (c) {
          return c.id === id;
        }) || CATS[0]
      );
    }

    // Reflect the active chip: highlighted, selected, and the only one in the
    // Tab order (arrow keys move between the rest).
    function paint() {
      CATS.forEach(function (c) {
        const on = c.id === activeId;
        buttons[c.id].classList.toggle("active", on);
        buttons[c.id].setAttribute("aria-selected", on ? "true" : "false");
        buttons[c.id].tabIndex = on ? 0 : -1;
      });
    }

    function choose(id, fire) {
      if (id === activeId) return;
      activeId = id;
      paint();
      if (fire !== false) {
        ctx.subfilters.reset(); // a different category has a different role set
        ctx.releases.setFilter();
      }
    }

    CATS.forEach(function (c, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "yt-rel-filter";
      b.textContent = c.label;
      b.setAttribute("role", "tab");
      b.addEventListener("click", function () {
        choose(c.id);
      });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = CATS[(i + dir + CATS.length) % CATS.length];
        buttons[next.id].focus();
        choose(next.id);
      });
      buttons[c.id] = b;
      bar.appendChild(b);
    });
    paint();

    return {
      // Does a release's role belong to the currently active category?
      test: function (role) {
        return find(activeId).test(role);
      },
      activeLabel: function () {
        return find(activeId).label;
      },
      // Back to the default category without firing a reload (the caller is
      // already (re)loading, e.g. on a new artist).
      reset: function () {
        choose(DEFAULT_ID, false);
      },
    };
  };
})();
