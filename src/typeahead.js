// Artist typeahead: a debounced Discogs search under the input with a keyboard-
// and mouse-navigable dropdown. Owns the input element's event wiring.
(function () {
  "use strict";
  const YTSP = (window.YTSP = window.YTSP || {});

  YTSP.createTypeahead = function (ctx) {
    const els = ctx.els;
    const cfg = ctx.cfg;
    const input = els.input;
    const suggestions = els.suggestions;

    let debounceTimer = null;
    let searchController = null; // AbortController for the in-flight fetch
    let searchSeq = 0; // guards against out-of-order responses
    let items = []; // current suggestions: { id, name }
    let highlight = -1;

    function closeSuggestions() {
      suggestions.hidden = true;
      suggestions.replaceChildren();
      items = [];
      highlight = -1;
      input.setAttribute("aria-expanded", "false");
    }

    function setHighlight(i) {
      const lis = suggestions.children;
      if (highlight >= 0 && lis[highlight]) lis[highlight].classList.remove("active");
      highlight = i;
      if (highlight >= 0 && lis[highlight]) {
        lis[highlight].classList.add("active");
        lis[highlight].scrollIntoView({ block: "nearest" });
      }
    }

    function renderSuggestions(list) {
      items = list;
      suggestions.replaceChildren();
      if (!list.length) {
        closeSuggestions();
        return;
      }
      list.forEach(function (item, i) {
        const li = document.createElement("li");
        li.className = "yt-search-panel-result";
        li.textContent = item.name;
        li.setAttribute("role", "option");
        // mousedown fires before blur closes the list; preventDefault keeps focus.
        li.addEventListener("mousedown", function (event) {
          event.preventDefault();
          ctx.releases.selectArtist(item);
        });
        li.addEventListener("mouseenter", function () {
          setHighlight(i);
        });
        suggestions.appendChild(li);
      });
      highlight = -1;
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function searchArtists(query) {
      if (searchController) searchController.abort();
      searchController = new AbortController();
      const seq = ++searchSeq;
      const url =
        cfg.DISCOGS_SEARCH +
        "?type=artist&per_page=" +
        cfg.MAX_RESULTS +
        "&q=" +
        encodeURIComponent(query);

      fetch(url, { signal: searchController.signal })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (seq !== searchSeq) return; // a newer search superseded this one
          const seen = new Set();
          const list = [];
          (data.results || []).forEach(function (r) {
            if (!r.title || seen.has(r.id)) return;
            seen.add(r.id);
            list.push({ id: r.id, name: r.title });
          });
          renderSuggestions(list);
        })
        .catch(function (err) {
          if (err.name === "AbortError" || seq !== searchSeq) return;
          closeSuggestions();
        });
    }

    // Used when the other-artists list picks an artist: fill the box, focus it
    // (cursor at the end), and search right away.
    function setQueryAndSearch(name) {
      if (!name) return;
      input.value = name;
      input.focus();
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch (e) {} // not all inputs support selection range
      if (debounceTimer) clearTimeout(debounceTimer);
      const query = name.trim();
      if (query.length >= cfg.MIN_QUERY_LEN) searchArtists(query);
    }

    input.addEventListener("input", function () {
      const query = input.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (query.length < cfg.MIN_QUERY_LEN) {
        if (searchController) searchController.abort();
        searchSeq++; // invalidate any pending response
        closeSuggestions();
        return;
      }
      debounceTimer = setTimeout(function () {
        searchArtists(query);
      }, cfg.DEBOUNCE_MS);
    });

    input.addEventListener("keydown", function (event) {
      if (suggestions.hidden) {
        // No open suggestions: ArrowDown drops focus into the releases list.
        if (event.key === "ArrowDown" && els.releases.children.length) {
          event.preventDefault();
          ctx.releases.rove(ctx.releases.firstTabbable());
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight(Math.min(highlight + 1, items.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight(Math.max(highlight - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        ctx.releases.selectArtist(highlight >= 0 ? items[highlight] : items[0]);
      } else if (event.key === "Escape") {
        closeSuggestions();
      }
    });

    // Delay so a result's mousedown selection registers before we close.
    input.addEventListener("blur", function () {
      setTimeout(closeSuggestions, 150);
    });

    return {
      closeSuggestions: closeSuggestions,
      setQueryAndSearch: setQueryAndSearch,
    };
  };
})();
