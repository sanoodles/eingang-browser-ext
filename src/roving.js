// Roving tabindex: exactly one row of a list is in the Tab order at a time, and
// arrow keys move focus (and the tabbable row) through it. Shared by the releases
// list and the other-artists list.
(function () {
  "use strict";

  const YTSP = (window.YTSP = window.YTSP || {});

  // opts: { container, rowClass, toInput, onRove? }
  //   container — the <ul> holding the rows
  //   rowClass  — class identifying real rows (skips decorative children)
  //   toInput   — called to move focus back up into the search box
  //   onRove    — optional hook run after a row is focused
  YTSP.createRoving = function (opts) {
    const container = opts.container;
    const rowClass = opts.rowClass;
    const toInput = opts.toInput;
    const onRove = opts.onRove;

    function rows() {
      return Array.prototype.filter.call(container.children, function (el) {
        return el.classList.contains(rowClass);
      });
    }

    function rove(li) {
      if (!li) return;
      rows().forEach(function (r) {
        r.tabIndex = -1;
      });
      li.tabIndex = 0;
      li.focus();
      if (onRove) onRove(li);
    }

    // Bind the standard key handling to one row; `activate` runs on Enter/Space.
    function attach(li, activate) {
      li.addEventListener("keydown", function (event) {
        const list = rows();
        const idx = list.indexOf(li);
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            rove(list[Math.min(idx + 1, list.length - 1)]);
            break;
          case "ArrowUp":
            event.preventDefault();
            if (idx === 0) toInput(); // back up into the search box
            else rove(list[idx - 1]);
            break;
          case "Home":
            event.preventDefault();
            rove(list[0]);
            break;
          case "End":
            event.preventDefault();
            rove(list[list.length - 1]);
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

    return { rove: rove, attach: attach };
  };
})();
