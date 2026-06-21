// "Other artists on this release" — derived from the release item's `artist`
// field already in the list response (a slash-joined string like
// "Spearhead / Radiohead"), so no extra API request is needed. Covers
// co-credited headline artists only, not producer/writer credits. Selecting an
// artist hands its name back to the typeahead and searches for it.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

  YTSP.createOtherArtists = function (ctx) {
    const els = ctx.els;
    const others = els.others;
    const otherHeading = els.otherHeading;

    const roving = YTSP.createRoving({
      container: others,
      rowClass: "yt-other",
      toInput: function () {
        els.input.focus();
      },
    });

    function selectOtherArtist(name) {
      if (!name) return;
      ctx.typeahead.setQueryAndSearch(name);
    }

    // Render either the artist names or a muted placeholder. The section is
    // always visible (and keeps its reserved height), so an empty state shows a
    // message rather than collapsing.
    function renderOtherList(names, emptyMessage) {
      others.replaceChildren();
      if (!names.length) {
        const li = document.createElement("li");
        li.className = "yt-other-empty";
        li.textContent = emptyMessage;
        others.appendChild(li);
        return;
      }
      names.forEach(function (name, i) {
        const li = document.createElement("li");
        li.className = "yt-other";
        li.tabIndex = i === 0 ? 0 : -1; // roving; first row is the one in the Tab order
        li.setAttribute("role", "button");
        li.setAttribute("aria-label", name);

        const nameEl = document.createElement("span");
        nameEl.className = "yt-other-name";
        nameEl.textContent = name;
        li.appendChild(nameEl);

        li.addEventListener("click", function () {
          selectOtherArtist(name);
        });
        roving.attach(li, function () {
          selectOtherArtist(name);
        });

        others.appendChild(li);
      });
    }

    // Idle state (no release selected yet); the section stays on screen.
    function clearOtherArtists() {
      otherHeading.textContent = "Other artists";
      renderOtherList([], "Select a release to see its other artists.");
    }

    function showOtherArtists(rel) {
      const label = "“" + (rel.title || "") + "”"; // “title”
      const artistName = ctx.releases.artistName();
      // Split on " / " — the spaces matter, so names like "AC/DC" stay intact —
      // then drop the artist we're browsing and the "Various" placeholder.
      const names = (rel.artist || "")
        .split(" / ")
        .map(function (s) {
          return s.trim();
        })
        .filter(function (name) {
          return name && name !== "Various" && name !== artistName;
        })
        .filter(function (name, i, arr) {
          return arr.indexOf(name) === i; // de-dup
        });

      otherHeading.textContent = "Other artists on " + label;
      renderOtherList(names, "No other artists on this release.");
    }

    return {
      clearOtherArtists: clearOtherArtists,
      showOtherArtists: showOtherArtists,
    };
  };
})();
