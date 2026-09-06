// Artist typeahead: debounced Discogs search with a keyboard/mouse-navigable
// dropdown. Owns the input element's event wiring. The same dropdown doubles as
// the recent-artists list while the box is empty (history.js) — the two states
// are mutually exclusive, so they share one element and one set of key handlers.
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
    let items = []; // current options, 1:1 with suggestions.children
    let highlight = -1;
    let mode = "results"; // "results" | "history"

    // Toggle the spinner at the input's right edge.
    function setLoading(on) {
      spinner.hidden = !on;
      input.setAttribute("aria-busy", String(on));
    }

    function closeSuggestions() {
      setLoading(false);
      suggestions.hidden = true;
      suggestions.replaceChildren();
      suggestions.classList.remove("ytsp-history-mode");
      suggestions.removeAttribute("aria-label");
      items = [];
      highlight = -1;
      mode = "results";
      input.setAttribute("aria-expanded", "false");
    }

    function openSuggestions() {
      highlight = -1;
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setLoading(false);
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

    // Every row behaves the same: mousedown beats the blur-close (preventDefault
    // keeps focus), hover highlights. Index, not item — forgetAt() re-renders.
    function wireOption(li, i) {
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        activate(items[i]);
      });
      li.addEventListener("mouseenter", () => setHighlight(i));
      return li;
    }

    function activate(item) {
      if (!item) return;
      if (item.clearAll) {
        ctx.history.clear();
        closeSuggestions();
        return;
      }
      ctx.releases.selectArtist(item);
    }

    function renderSuggestions(list) {
      mode = "results";
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
        suggestions.appendChild(wireOption(li, i));
      });
      openSuggestions();
    }

    // The remove button stays out of the Tab order — Tab would blur the box and
    // close the dropdown — so Delete on the highlighted row is the keyboard path.
    function historyRow(entry, i) {
      const li = document.createElement("li");
      li.className = "yt-search-panel-result yt-search-panel-history";
      li.setAttribute("role", "option");

      const name = document.createElement("span");
      name.className = "yt-search-panel-history-name";
      name.textContent = entry.name;

      const forget = document.createElement("button");
      forget.type = "button";
      forget.className = "yt-search-panel-history-remove";
      forget.tabIndex = -1;
      forget.textContent = "×";
      forget.title = `Remove ${entry.name}`;
      forget.setAttribute("aria-label", `Remove ${entry.name} from recent artists`);
      forget.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation(); // the row's own mousedown would select the artist
        forgetAt(i);
      });

      li.append(name, forget);
      return wireOption(li, i);
    }

    // Clear-all is an option like the rest, so arrows and Enter reach it.
    function clearAllRow(i) {
      const li = document.createElement("li");
      li.className = "yt-search-panel-result yt-search-panel-clear";
      li.textContent = "Clear recent artists";
      li.setAttribute("role", "option");
      return wireOption(li, i);
    }

    function renderHistory() {
      const recent = ctx.history.list();
      if (!recent.length) {
        closeSuggestions();
        return;
      }
      mode = "history";
      items = [...recent, { clearAll: true }];
      suggestions.replaceChildren(
        ...recent.map(historyRow),
        clearAllRow(items.length - 1)
      );
      suggestions.classList.add("ytsp-history-mode");
      suggestions.setAttribute("aria-label", "Recent artists");
      openSuggestions();
    }

    // Drop one entry and rebuild, holding the highlight where it was.
    function forgetAt(i) {
      const entry = items[i];
      if (!entry || entry.clearAll) return;
      const at = highlight;
      ctx.history.remove(entry.id);
      renderHistory();
      if (at >= 0 && items.length) setHighlight(Math.min(at, items.length - 1));
    }

    // Empty box: offer the recent artists rather than nothing.
    function showHistory() {
      if (!input.value.trim()) renderHistory();
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
        // Emptied the box: fall back to the recent artists. One stray character
        // is below MIN_QUERY_LEN but not empty, so it shows nothing.
        if (query) closeSuggestions();
        else showHistory();
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
        // Results: Enter with nothing highlighted takes the top hit. History:
        // it needs a deliberate pick, so Enter on an untouched box stays inert.
        if (mode !== "history") activate(highlight >= 0 ? items[highlight] : items[0]);
        else if (highlight >= 0) activate(items[highlight]);
      } else if (event.key === "Delete" && mode === "history" && highlight >= 0) {
        event.preventDefault();
        forgetAt(highlight);
      } else if (event.key === "Escape") {
        closeSuggestions();
      }
    });

    // Typing here beats chasing YouTube's results: a search's focus poll would
    // otherwise pull the caret out of the box mid-word (inject-focus.js).
    input.addEventListener("focus", () => {
      ctx.stopResultFocus();
      showHistory();
    });

    input.addEventListener("blur", () => setTimeout(closeSuggestions, BLUR_CLOSE_MS));

    return {
      closeSuggestions,
      setQueryAndSearch,
      // history.js, once its stored list arrives (after the panel is wired).
      refreshHistory: () => {
        if (document.activeElement === input) showHistory();
      },
    };
  };
})();
