// "Other artists on this release" — parsed from the release's `artist` field
// already in the list response (slash-joined, "Spearhead / Radiohead"), so no
// extra request. Co-credited headline artists only, not producer/writer
// credits. Selecting one hands its name to the typeahead and searches.
(function () {
  "use strict";

  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /** @param {Ctx} ctx */
  YTSP.createOtherArtists = function (ctx) {
    const { els } = ctx;
    const { others, otherHeading } = els;

    const roving = YTSP.createRoving({
      container: others,
      rowClass: "yt-other",
      toInput: () => els.input.focus(),
    });

    function selectOtherArtist(name) {
      if (!name) return;
      ctx.typeahead.setQueryAndSearch(name);
    }

    // Render the artist names, or a muted placeholder. The section is always
    // visible, so an empty state shows a message rather than collapsing.
    function renderOtherList(names, emptyMessage) {
      others.replaceChildren();
      if (!names.length) {
        const li = document.createElement("li");
        li.className = "yt-other-empty";
        li.textContent = emptyMessage;
        others.appendChild(li);
        return;
      }
      names.forEach((name, i) => {
        const li = document.createElement("li");
        li.className = "yt-other";
        li.tabIndex = i === 0 ? 0 : -1; // roving; first row is tabbable
        li.setAttribute("role", "button");
        li.setAttribute("aria-label", name);

        const nameEl = document.createElement("span");
        nameEl.className = "yt-other-name";
        nameEl.textContent = name;
        li.appendChild(nameEl);

        li.addEventListener("click", () => selectOtherArtist(name));
        roving.attach(li, () => selectOtherArtist(name));

        others.appendChild(li);
      });
    }

    // Idle state (no release selected yet).
    function clearOtherArtists() {
      otherHeading.textContent = "Other artists";
      renderOtherList([], "Select a release to see its other artists.");
    }

    function showOtherArtists(rel) {
      const label = `“${rel.title || ""}”`;
      const artistName = YTSP.cleanArtistName(ctx.releases.artistName());
      // Split on " / " (spaces matter, so "AC/DC" stays intact), clean each, then
      // drop the browsed artist and "Various".
      const names = (rel.artist || "")
        .split(" / ")
        .map((s) => YTSP.cleanArtistName(s))
        .filter((name) => name && !YTSP.isVarious(name) && name !== artistName)
        .filter((name, i, arr) => arr.indexOf(name) === i); // de-dup

      otherHeading.textContent = `Other artists on ${label}`;
      renderOtherList(names, "No other artists on this release.");
    }

    return { clearOtherArtists, showOtherArtists };
  };
})();
