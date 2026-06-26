// Role sub-filter chips, a second row under the category filters (filters.js).
// Discogs' artist-releases endpoint tags every entry with a coarse `role` (Main,
// Remix, Producer, Appearance, TrackAppearance, …); these chips narrow the
// active category to one role. The set is built from the roles actually loaded,
// so single-role categories (Releases, Unofficial) show no sub-filter at all.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  const ALL = "__all__";
  // Friendlier labels for the roles this endpoint emits; unknown roles show raw.
  const LABELS = {
    Main: "Main",
    Remix: "Remixes",
    Producer: "Production",
    "Co-producer": "Co-production",
    Appearance: "Full release",
    TrackAppearance: "On a track",
    UnofficialRelease: "Unofficial",
  };

  /** @param {Ctx} ctx */
  YTSP.createSubfilters = function (ctx) {
    const bar = ctx.els.subfilters;
    let activeRole = ALL;
    let roles = []; // role values currently shown as chips (ALL is implicit)

    function labelFor(role) {
      return role === ALL ? "All" : LABELS[role] ?? role;
    }

    function paint() {
      for (const b of /** @type {HTMLElement[]} */ ([...bar.children])) {
        const on = b.dataset.role === activeRole;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
      }
    }

    function chip(role) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "yt-rel-subfilter";
      b.dataset.role = role;
      b.textContent = labelFor(role);
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => {
        if (role === activeRole) return;
        activeRole = role;
        paint();
        ctx.releases.setFilter();
      });
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const kids = /** @type {HTMLElement[]} */ ([...bar.children]);
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = kids[(kids.indexOf(b) + dir + kids.length) % kids.length];
        next.focus();
        next.click();
      });
      return b;
    }

    // Rebuild the chips from the roles in `items` that pass the active category's
    // `mainTest`. No-op when the role set is unchanged (keeps focus); hidden when
    // one role or fewer remains, since there's nothing to narrow.
    function setFromCache(items, mainTest) {
      const next = [];
      for (const r of items) {
        if (mainTest(r.role) && !next.includes(r.role)) next.push(r.role);
      }
      const same =
        next.length === roles.length && next.every((r, i) => r === roles[i]);
      if (same) return;
      roles = next;
      if (!roles.includes(activeRole)) activeRole = ALL; // role no longer present
      bar.replaceChildren();
      bar.hidden = roles.length <= 1;
      if (bar.hidden) return;
      bar.appendChild(chip(ALL));
      for (const r of roles) bar.appendChild(chip(r));
      paint();
    }

    return {
      test: (role) => activeRole === ALL || role === activeRole,
      setFromCache,
      reset: () => {
        activeRole = ALL;
        roles = [];
        bar.replaceChildren();
        bar.hidden = true;
      },
    };
  };
})();
