// Ambient declarations so `npm run typecheck` (jsconfig.json) can check the
// content scripts. These are type-only: nothing here ships with the extension.

interface Window {
  // The shared namespace every isolated-world content script attaches to and
  // reads from (src/config.js). Untyped on purpose — the factory results are
  // wired through it dynamically (see the Ctx typedef), so typing it precisely
  // would fight the pattern. Local logic in each file is still checked.
  YTSP: any;
  // MAIN-world counterpart shared by inject-search.js / inject-focus.js.
  __ytSearchPanelInject?: any;
}

// Lets the Ctx typedef (config.js) resolve `ReturnType<typeof YTSP.createX>` at
// the file's top level, where the IIFE-local `const YTSP` isn't in scope. The
// per-file `const YTSP` shadows this inside each module.
declare const YTSP: any;

// Minimal shape of the chrome.* API surface the panel actually uses
// (panel-chrome.js: persist width + collapsed state). Avoids a dependency on
// the full @types/chrome; widen this if more of the API gets used.
declare namespace chrome.storage {
  const local: {
    get(keys: string[], callback: (items: Record<string, unknown>) => void): void;
    set(items: Record<string, unknown>): void;
  };
}
