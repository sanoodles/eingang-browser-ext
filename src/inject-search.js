// Runs in YouTube's MAIN world (manifest "world": "MAIN") so it can drive
// YouTube's own search box. An isolated-world content script can't: YouTube's
// search component ignores values set from the isolated world, so a search
// triggered there silently does nothing.
//
// This file exposes runYouTubeSearch on a shared namespace; inject-focus.js
// listens for the panel's request, calls it, and then moves keyboard focus.
(function () {
  "use strict";

  const NS = /** @type {any} */ (window.__ytSearchPanelInject = window.__ytSearchPanelInject || {});

  // Drive YouTube's own search box: set its value, then press Enter the way a
  // user would. YouTube handles Enter with an in-page (SPA) navigation, so there
  // is no full document reload. Returns false if the search box can't be found.
  NS.runYouTubeSearch = (text) => {
    const ytInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("input#search, input[name='search_query']")
    );
    if (!ytInput) return false;

    // Set the value through the native setter so YouTube's framework-bound input
    // notices the change, then announce it with an input event.
    const proto = window.HTMLInputElement?.prototype;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(ytInput, text);
    else ytInput.value = text;
    ytInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Submit by pressing Enter on the focused input.
    ytInput.focus();
    for (const type of ["keydown", "keypress", "keyup"]) {
      ytInput.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
        })
      );
    }
    return true;
  };
})();
