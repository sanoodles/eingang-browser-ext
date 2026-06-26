// Artist typeahead: debounced Discogs search with a keyboard/mouse-navigable
// dropdown. Owns the input element's event wiring.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  // Delay close-on-blur so a result's mousedown registers first.
  const BLUR_CLOSE_MS = 150;

  /** @param {Ctx} ctx */
  YTSP.createTypeahead = function (ctx) {
    const { els, cfg } = ctx;
    const { input, suggestions, spinner } = els;

    let debounceTimer = null;
    let searchController = null; // aborts the in-flight fetch
    let searchSeq = 0; // guards against out-of-order responses
    let items = []; // current suggestions: { id, name }
    let highlight = -1;

    // Toggle the spinner at the input's right edge.
    function setLoading(on) {
      spinner.hidden = !on;
      input.setAttribute("aria-busy", String(on));
    }

    function closeSuggestions() {
      setLoading(false);
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
      list.forEach((item, i) => {
        const li = document.createElement("li");
        li.className = "yt-search-panel-result";
        li.textContent = item.name;
        li.setAttribute("role", "option");
        // mousedown beats the blur-close; preventDefault keeps focus.
        li.addEventListener("mousedown", (event) => {
          event.preventDefault();
          ctx.releases.selectArtist(item);
        });
        li.addEventListener("mouseenter", () => setHighlight(i));
        suggestions.appendChild(li);
      });
      highlight = -1;
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setLoading(false);
    }

    async function searchArtists(query) {
      setLoading(true);
      searchController?.abort();
      searchController = new AbortController();
      const seq = ++searchSeq;
      const url = `${cfg.DISCOGS_SEARCH}?type=artist&per_page=${cfg.MAX_RESULTS}&q=${encodeURIComponent(query)}`;

      try {
        const res = await fetch(url, { signal: searchController.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (seq !== searchSeq) return; // a newer search superseded this one
        const seen = new Set();
        const list = [];
        for (const r of data.results ?? []) {
          if (!r.title || seen.has(r.id)) continue;
          seen.add(r.id);
          list.push({ id: r.id, name: r.title });
        }
        renderSuggestions(list);
      } catch (err) {
        if (err.name === "AbortError" || seq !== searchSeq) return;
        closeSuggestions();
      }
    }

    // Other-artists list picked an artist: fill the box, focus (cursor at end),
    // and search now.
    function setQueryAndSearch(name) {
      if (!name) return;
      input.value = name;
      input.focus();
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {} // not all inputs support selection range
      if (debounceTimer) clearTimeout(debounceTimer);
      const query = name.trim();
      if (query.length >= cfg.MIN_QUERY_LEN) searchArtists(query);
    }

    input.addEventListener("input", () => {
      const query = input.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (query.length < cfg.MIN_QUERY_LEN) {
        searchController?.abort();
        searchSeq++; // invalidate any pending response
        closeSuggestions();
        return;
      }
      setLoading(true); // immediate feedback during the debounce wait
      debounceTimer = setTimeout(() => searchArtists(query), cfg.DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (event) => {
      if (suggestions.hidden) {
        // No dropdown: ArrowDown drops focus into the releases list.
        if (event.key === "ArrowDown" && els.releases.children.length) {
          event.preventDefault();
          ctx.releases.focusFirst();
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

    input.addEventListener("blur", () => setTimeout(closeSuggestions, BLUR_CLOSE_MS));

    return { closeSuggestions, setQueryAndSearch };
  };
})();
