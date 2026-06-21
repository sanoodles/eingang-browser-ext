// Panel chrome: a collapse/expand toggle and a draggable left edge to resize the
// panel. Both the width and the collapsed state persist via chrome.storage.local.
// Width is applied as the `--yt-panel-width` custom property on <html> and the
// collapsed state as an `ytsp-collapsed` class on <html>; panel.css and
// layout.css read both, so the page reflows (and the masthead inset follows)
// without JS touching YouTube's own DOM.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

  YTSP.createPanelChrome = function (ctx) {
    const { cfg, els } = ctx;
    const root = document.documentElement;

    let width = cfg.PANEL_DEFAULT_WIDTH;

    // Keep the panel within [MIN_WIDTH, MAX_WIDTH] and never so wide it leaves
    // YouTube less than MIN_KEEP — clamped to the current viewport.
    function clampWidth(px) {
      const fitMax = Math.max(cfg.PANEL_MIN_WIDTH, window.innerWidth - cfg.PANEL_MIN_KEEP);
      const max = Math.min(cfg.PANEL_MAX_WIDTH, fitMax);
      return Math.min(max, Math.max(cfg.PANEL_MIN_WIDTH, Math.round(px)));
    }

    function applyWidth() {
      root.style.setProperty("--yt-panel-width", `${width}px`);
    }

    function isCollapsed() {
      return root.classList.contains("ytsp-collapsed");
    }

    function setCollapsed(collapsed) {
      root.classList.toggle("ytsp-collapsed", collapsed);
      els.collapseBtn.setAttribute("aria-expanded", String(!collapsed));
      els.reopenBtn.setAttribute("aria-hidden", String(!collapsed));
      save();
    }

    // Persistence is best-effort: chrome.storage is async and may be absent if
    // the "storage" permission is ever dropped, so every call is guarded.
    function save() {
      try {
        chrome.storage.local.set({
          [cfg.STORE_WIDTH]: width,
          [cfg.STORE_COLLAPSED]: isCollapsed(),
        });
      } catch {}
    }

    function load() {
      try {
        chrome.storage.local.get([cfg.STORE_WIDTH, cfg.STORE_COLLAPSED], (got) => {
          if (typeof got?.[cfg.STORE_WIDTH] === "number") {
            width = clampWidth(got[cfg.STORE_WIDTH]);
            applyWidth();
          }
          if (got?.[cfg.STORE_COLLAPSED]) setCollapsed(true);
        });
      } catch {}
    }

    // --- drag to resize ---------------------------------------------------
    // A full-viewport overlay during the drag captures the mouse over YouTube's
    // player iframe (which would otherwise swallow mousemove/mouseup).
    let overlay = null;

    function onMove(e) {
      width = clampWidth(window.innerWidth - e.clientX);
      applyWidth();
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      overlay?.remove();
      overlay = null;
      root.classList.remove("ytsp-resizing");
      save();
    }

    function onDown(e) {
      e.preventDefault();
      overlay = document.createElement("div");
      overlay.className = "ytsp-resize-overlay";
      document.body.appendChild(overlay);
      root.classList.add("ytsp-resizing");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    els.resizeHandle.addEventListener("mousedown", onDown);

    // Keyboard resize: arrows nudge the edge (Shift for a bigger step). Left
    // grows the panel (edge moves left), Right shrinks it.
    els.resizeHandle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 40 : 16;
      if (e.key === "ArrowLeft") width = clampWidth(width + step);
      else if (e.key === "ArrowRight") width = clampWidth(width - step);
      else return;
      e.preventDefault();
      applyWidth();
      save();
    });

    els.collapseBtn.addEventListener("click", () => setCollapsed(true));
    els.reopenBtn.addEventListener("click", () => setCollapsed(false));

    // Keep the width valid if the window is resized below the current fit.
    window.addEventListener("resize", () => {
      const clamped = clampWidth(width);
      if (clamped !== width) {
        width = clamped;
        applyWidth();
      }
    });

    applyWidth();
    load();

    return { setCollapsed, isCollapsed };
  };
})();
