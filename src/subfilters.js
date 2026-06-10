// Role sub-filter chips, a second row under the category filters (filters.js).
// Discogs' artist-releases endpoint tags every entry with a coarse `role` (Main,
// Remix, Producer, Appearance, TrackAppearance, …); these chips narrow the
// active category to one role. The set is built from the roles actually loaded,
// so single-role categories (Releases, Unofficial) show no sub-filter at all.
(function () {
  "use strict";
  const YTSP = (window.YTSP = window.YTSP || {});

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

  YTSP.createSubfilters = function (ctx) {
    const bar = ctx.els.subfilters;
    let activeRole = ALL;
    let roles = []; // role values currently shown as chips (ALL is implicit)

    function labelFor(role) {
      return role === ALL ? "All" : LABELS[role] || role;
    }

    function paint() {
      Array.prototype.forEach.call(bar.children, function (b) {
        const on = b.dataset.role === activeRole;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
    }

    function chip(role) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "yt-rel-subfilter";
      b.dataset.role = role;
      b.textContent = labelFor(role);
      b.setAttribute("role", "tab");
      b.addEventListener("click", function () {
        if (role === activeRole) return;
        activeRole = role;
        paint();
        ctx.releases.setFilter();
      });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const kids = Array.prototype.slice.call(bar.children);
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
      items.forEach(function (r) {
        if (mainTest(r.role) && next.indexOf(r.role) < 0) next.push(r.role);
      });
      const same =
        next.length === roles.length &&
        next.every(function (r, i) { return r === roles[i]; });
      if (same) return;
      roles = next;
      if (roles.indexOf(activeRole) < 0) activeRole = ALL; // role no longer present
      bar.replaceChildren();
      bar.hidden = roles.length <= 1;
      if (bar.hidden) return;
      bar.appendChild(chip(ALL));
      roles.forEach(function (r) { bar.appendChild(chip(r)); });
      paint();
    }

    return {
      test: function (role) {
        return activeRole === ALL || role === activeRole;
      },
      setFromCache: setFromCache,
      reset: function () {
        activeRole = ALL;
        roles = [];
        bar.replaceChildren();
        bar.hidden = true;
      },
    };
  };
})();
