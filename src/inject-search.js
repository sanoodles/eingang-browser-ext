// Runs in YouTube's MAIN world so it can drive YouTube's own search box —
// the isolated world can't (YouTube ignores values set from there). Exposes
// runYouTubeSearch on a shared namespace; inject-focus.js calls it.
(function () {
  "use strict";

  const NS = /** @type {any} */ (window.__ytSearchPanelInject = window.__ytSearchPanelInject || {});

  // Set the search box's value, then press Enter as a user would — YouTube
  // handles it with an in-page (no reload) nav. False if the box isn't found.
  NS.runYouTubeSearch = (text) => {
    const ytInput = /** @type {HTMLInputElement | null} */ (
      document.querySelector("input#search, input[name='search_query']")
    );
    if (!ytInput) return false;

    // Set via the native setter so the framework-bound input notices, then fire
    // an input event.
    const proto = window.HTMLInputElement?.prototype;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(ytInput, text);
    else ytInput.value = text;
    ytInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Submit: Enter on the focused input.
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
