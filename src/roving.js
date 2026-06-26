// Roving tabindex: one row of a list is in the Tab order at a time; arrow keys
// move focus (and the tabbable row). Shared by the releases and other-artists
// lists.
(function () {
  "use strict";

  const YTSP = /** @type {any} */ (window.YTSP = window.YTSP || {});

  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container the <ul> holding the rows
   * @param {string} opts.rowClass class identifying real rows (skips decorative children)
   * @param {() => void} opts.toInput moves focus back up into the search box
   * @param {(li: HTMLElement) => void} [opts.onRove] optional hook run after a row is focused
   */
  YTSP.createRoving = function (opts) {
    const { container, rowClass, toInput, onRove } = opts;

    function rows() {
      return /** @type {HTMLElement[]} */ (
        [...container.children].filter((el) => el.classList.contains(rowClass))
      );
    }

    function rove(li) {
      if (!li) return;
      for (const r of rows()) r.tabIndex = -1;
      li.tabIndex = 0;
      li.focus();
      onRove?.(li);
    }

    // Bind key handling to one row; `activate` runs on Enter/Space.
    function attach(li, activate) {
      li.addEventListener("keydown", (event) => {
        const list = rows();
        const idx = list.indexOf(li);
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            rove(list[Math.min(idx + 1, list.length - 1)]);
            break;
          case "ArrowUp":
            event.preventDefault();
            if (idx === 0) toInput(); // back up into the box
            else rove(list[idx - 1]);
            break;
          case "Home":
            event.preventDefault();
            rove(list[0]);
            break;
          case "End":
            event.preventDefault();
            rove(list.at(-1));
            break;
          case "Enter":
          case " ":
            event.preventDefault();
            activate();
            break;
          case "Escape":
            event.preventDefault();
            toInput();
            break;
        }
      });
    }

    return { rove, attach };
  };
})();
