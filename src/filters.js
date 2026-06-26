// Category filter chips — Releases / Appearances / Unofficial / Credits —
// mirroring the Discogs artist-page discography filter. Owns the category
// model: each filter tests a release's Discogs `role`.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  // Four buckets over Discogs' `role`, matching the artist page. Credits is the
  // catch-all (Remix, Producer, Written-By, …) — anything not the other three.
  const CATS = [
    { id: "releases", label: "Releases", test: (r) => r === "Main" },
    {
      id: "appearances",
      label: "Appearances",
      test: (r) => r === "Appearance" || r === "TrackAppearance",
    },
    { id: "unofficial", label: "Unofficial", test: (r) => r === "UnofficialRelease" },
    {
      id: "credits",
      label: "Credits",
      test: (r) =>
        r !== "Main" &&
        r !== "Appearance" &&
        r !== "TrackAppearance" &&
        r !== "UnofficialRelease",
    },
  ];
  const DEFAULT_ID = "releases";

  /** @param {Ctx} ctx */
  YTSP.createFilters = function (ctx) {
    const bar = ctx.els.filters;
    let activeId = DEFAULT_ID;
    const buttons = {};

    function find(id) {
      return CATS.find((c) => c.id === id) || CATS[0];
    }

    // Reflect the active chip: highlighted, selected, the only one tabbable.
    function paint() {
      for (const c of CATS) {
        const on = c.id === activeId;
        buttons[c.id].classList.toggle("active", on);
        buttons[c.id].setAttribute("aria-selected", String(on));
        buttons[c.id].tabIndex = on ? 0 : -1;
      }
    }

    function choose(id, fire) {
      if (id === activeId) return;
      activeId = id;
      paint();
      if (fire !== false) {
        ctx.subfilters.reset(); // different category, different role set
        ctx.releases.setFilter();
      }
    }

    CATS.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "yt-rel-filter";
      b.textContent = c.label;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => choose(c.id));
      b.addEventListener("keydown", (e) => {
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
      // Does a release's role belong to the active category?
      test: (role) => find(activeId).test(role),
      activeLabel: () => find(activeId).label,
      // Back to the default category without reloading (caller already (re)loads).
      reset: () => choose(DEFAULT_ID, false),
    };
  };
})();
