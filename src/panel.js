// Builds the panel DOM, wires the modules together, and bootstraps once <body>
// exists. Must load last (after the module files) since buildPanel() calls their
// factories. Also bridges a query to the MAIN-world helper (inject-search.js /
// inject-focus.js) which drives YouTube's own search box.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});
  const cfg = YTSP.config;

  // Guard against double injection (YouTube's SPA navigations can re-run things).
  if (document.getElementById(cfg.PANEL_ID)) return;

  // Hand a query to the MAIN-world helper via a shared DOM attribute and event;
  // it runs YouTube's search box for an in-page (no full reload) navigation.
  function runYouTubeSearch(text) {
    document.documentElement.setAttribute("data-yt-search-panel-query", text);
    document.dispatchEvent(new CustomEvent("yt-search-panel-run"));
  }

  function buildPanel() {
    if (document.getElementById(cfg.PANEL_ID)) return;
    if (!document.body) return;

    const panel = document.createElement("div");
    panel.id = cfg.PANEL_ID;

    // Draggable left edge (panel-chrome.js): a thin grip overlaying the border.
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "yt-search-panel-resize";
    resizeHandle.tabIndex = 0;
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.setAttribute("aria-label", "Resize panel");

    // Header row: title + a button that collapses the panel out of the way.
    const header = document.createElement("div");
    header.className = "yt-search-panel-header";

    const heading = document.createElement("div");
    heading.className = "yt-search-panel-heading";
    heading.textContent = "Search by artist";

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "yt-search-panel-collapse";
    collapseBtn.textContent = "›";
    collapseBtn.title = "Hide panel";
    collapseBtn.setAttribute("aria-label", "Hide panel");
    collapseBtn.setAttribute("aria-expanded", "true");

    header.appendChild(heading);
    header.appendChild(collapseBtn);

    // input + suggestion list live in a positioned wrapper so the dropdown can
    // overlay below the input.
    const box = document.createElement("div");
    box.className = "yt-search-panel-box";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "yt-search-panel-input";
    input.placeholder = "Type an artist…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    const suggestions = document.createElement("ul");
    suggestions.className = "yt-search-panel-results";
    suggestions.setAttribute("role", "listbox");
    suggestions.hidden = true;

    // Spinner overlaid at the input's right edge while a lookup is in flight.
    const spinner = document.createElement("div");
    spinner.className = "yt-search-panel-spinner";
    spinner.setAttribute("aria-hidden", "true");
    spinner.hidden = true;

    box.appendChild(input);
    box.appendChild(spinner);
    box.appendChild(suggestions);

    // Releases area: category filter chips, a status line, and a scrollable,
    // auto-paging list. Chips stay hidden until an artist is selected.
    const filters = document.createElement("div");
    filters.className = "yt-rel-filters";
    filters.setAttribute("role", "tablist");
    filters.setAttribute("aria-label", "Release category");
    filters.hidden = true;

    const subfilters = document.createElement("div");
    subfilters.className = "yt-rel-subfilters";
    subfilters.setAttribute("role", "tablist");
    subfilters.setAttribute("aria-label", "Role within category");
    subfilters.hidden = true;

    // Client-side text filter over the loaded releases (song-filter.js). Hidden
    // until an artist is selected, like the category chips.
    const songFilter = document.createElement("input");
    songFilter.type = "text";
    songFilter.className = "yt-rel-filter-input";
    songFilter.placeholder = "Filter these releases…";
    songFilter.autocomplete = "off";
    songFilter.spellcheck = false;
    songFilter.setAttribute("aria-label", "Filter releases");
    songFilter.hidden = true;

    const status = document.createElement("div");
    status.className = "yt-search-panel-status";
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    const releases = document.createElement("ul");
    releases.className = "yt-search-panel-releases";

    // "Other artists on this release" section, filled when a release activates.
    const otherHeading = document.createElement("div");
    otherHeading.className = "yt-search-panel-subheading";
    otherHeading.setAttribute("aria-live", "polite");

    const others = document.createElement("ul");
    others.className = "yt-search-panel-others";

    // Footer: a one-click mailto link for user feedback (no backend, no perms —
    // it just opens the user's mail client with a prefilled draft).
    const feedback = document.createElement("a");
    feedback.className = "yt-search-panel-feedback";
    feedback.textContent = "Send feedback";
    feedback.href = `mailto:samuelgomezcrespo@gmail.com?subject=${encodeURIComponent("Eingang feedback")}`;

    panel.appendChild(resizeHandle);
    panel.appendChild(header);
    panel.appendChild(box);
    panel.appendChild(filters);
    panel.appendChild(subfilters);
    panel.appendChild(songFilter);
    panel.appendChild(status);
    panel.appendChild(releases);
    panel.appendChild(otherHeading);
    panel.appendChild(others);
    panel.appendChild(feedback);
    document.body.appendChild(panel);

    // Floating tab on the page's right edge that brings the panel back; shown by
    // CSS only while the panel is collapsed. Lives outside the panel so it stays
    // reachable when the panel is hidden.
    const reopenBtn = document.createElement("button");
    reopenBtn.type = "button";
    reopenBtn.id = "yt-search-panel-reopen";
    reopenBtn.textContent = "‹";
    reopenBtn.title = "Show artist search panel";
    reopenBtn.setAttribute("aria-label", "Show artist search panel");
    reopenBtn.setAttribute("aria-hidden", "true");
    document.body.appendChild(reopenBtn);

    // Shared context; modules reference each other lazily via ctx, so creation
    // order doesn't matter as long as all are set before any event fires.
    const els = { input, suggestions, spinner, filters, subfilters, songFilter, status, releases, otherHeading, others, resizeHandle, collapseBtn, reopenBtn };
    const ctx = { els, cfg, runYouTubeSearch };
    ctx.chrome = YTSP.createPanelChrome(ctx);
    ctx.typeahead = YTSP.createTypeahead(ctx);
    ctx.releases = YTSP.createReleases(ctx);
    ctx.filters = YTSP.createFilters(ctx);
    ctx.subfilters = YTSP.createSubfilters(ctx);
    ctx.songFilter = YTSP.createSongFilter(ctx);
    ctx.other = YTSP.createOtherArtists(ctx);
    ctx.other.clearOtherArtists(); // show the section's idle state from the start
  }

  if (document.body) {
    buildPanel();
  } else {
    // body not ready yet — wait for it.
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        buildPanel();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
})();
