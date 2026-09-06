// Recent artists: the handful last opened, kept in chrome.storage.local so the
// typeahead can offer them when the artist box is empty. Entries carry the
// Discogs id, so picking one goes straight to releases — no search request.
(function () {
  "use strict";
  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /** @param {Ctx} ctx */
  YTSP.createHistory = function (ctx) {
    const { cfg } = ctx;

    /** @type {{ id: number, name: string }[]} */
    let entries = []; // newest first

    // Best-effort: chrome.storage may be absent if the "storage" permission is
    // dropped, so guard every call (as panel-chrome.js does).
    function save() {
      try {
        chrome.storage.local.set({ [cfg.STORE_HISTORY]: entries });
      } catch {}
    }

    function load() {
      try {
        chrome.storage.local.get([cfg.STORE_HISTORY], (got) => {
          const stored = got?.[cfg.STORE_HISTORY];
          if (!Array.isArray(stored)) return;
          entries = stored
            .filter((e) => e?.id && e?.name)
            .slice(0, cfg.HISTORY_MAX)
            .map((e) => ({ id: e.id, name: String(e.name) }));
          // This callback lands after the panel is wired, so the box may already
          // be focused and empty over a dropdown that found nothing to show.
          ctx.typeahead?.refreshHistory();
        });
      } catch {}
    }

    // Re-recording a known artist moves it back to the top.
    function record(item) {
      if (!item?.id || !item.name) return;
      entries = [{ id: item.id, name: item.name }, ...entries.filter((e) => e.id !== item.id)];
      entries = entries.slice(0, cfg.HISTORY_MAX);
      save();
    }

    function remove(id) {
      entries = entries.filter((e) => e.id !== id);
      save();
    }

    function clear() {
      entries = [];
      save();
    }

    load();

    return { list: () => entries, record, remove, clear };
  };
})();
