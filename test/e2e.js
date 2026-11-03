// End-to-end test of the full panel journey on real YouTube:
//   typeahead search (spinner while loading; arrow-key highlight) → artist select
//   → release list (default Releases filter; arrow-key roving into/within the list)
//   → text filter (narrow by title, then clear) → category filter (Credits)
//   → role sub-filter (Remixes) → feedback link present
//   → activate a release (drives YouTube's search + fills "Other artists")
//   → panel chrome (collapse/reopen toggle, drag- and keyboard-resize,
//     persist across reload)
//   → recent artists (empty box offers past picks; picking one skips the Discogs
//     lookup; remove one, clear all).
//
// It launches its own headless Chrome with the unpacked extension and tears it
// down. It hits live YouTube + the Discogs API, so it needs network and is
// subject to Discogs' unauthenticated rate limit (~25 requests/minute) — keep
// runs spaced out. Asserts accumulate; the process exits non-zero on any fail.
//
// Run:    npm run test:e2e        (or: node test/e2e.js)
// Chrome: set CHROME_BIN, or have Playwright's Chromium cached at
//         ~/.cache/ms-playwright/chromium-<n>/chrome-linux64/chrome
//         (install with: npx playwright-core install chromium).

const { chromium } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "yt-e2e-"));

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log("  PASS  " + name);
  } else {
    failed++;
    console.log("  FAIL  " + name + (detail ? "  — " + detail : ""));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitOk(fn) {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

// The content script appends its UI to document.body, so the panel is readable
// from the MAIN world that page.evaluate runs in.
const panelState = `(() => {
  const q = (s) => document.querySelector(s);
  const chipInfo = (bar) => bar ? {
    hidden: !!bar.hidden,
    chips: [...bar.children].map(b =>
      b.textContent.trim() + (b.classList.contains('active') ? '*' : ''))
  } : null;
  const rows = [...document.querySelectorAll('.yt-rel')];
  return {
    status: (q('.yt-search-panel-status') || {}).textContent || null,
    filters: chipInfo(q('.yt-rel-filters')),
    subfilters: chipInfo(q('.yt-rel-subfilters')),
    rowCount: rows.length,
    metas: rows.slice(0, 12).map(r =>
      (r.querySelector('.yt-rel-meta') || {}).textContent || ''),
    titles: rows.map(r => (r.querySelector('.yt-rel-title') || {}).textContent || ''),
    filterValue: (q('.yt-rel-filter-input') || {}).value || '',
    otherHeading: (q('.yt-search-panel-subheading') || {}).textContent || null,
    otherRows: document.querySelectorAll('.yt-other').length,
    otherEmpty: (q('.yt-other-empty') || {}).textContent || null,
  };
})()`;

// Artist dropdown (typeahead.js) state, covering both what it shows: Discogs
// results while typing, and the recent-artists list while the box is empty.
const dropdownState = `(() => {
  const input = document.querySelector('.yt-search-panel-input');
  const ul = document.querySelector('.yt-search-panel-results');
  const rows = [...document.querySelectorAll('.yt-search-panel-result')];
  return {
    open: !!ul && !ul.hidden,
    historyMode: !!ul && ul.classList.contains('ytsp-history-mode'),
    expanded: input && input.getAttribute('aria-expanded'),
    inputValue: (input || {}).value || '',
    entries: rows.filter(r => r.classList.contains('yt-search-panel-history'))
      .map(r => (r.querySelector('.yt-search-panel-history-name') || {}).textContent || ''),
    hasClearAll: rows.some(r => r.classList.contains('yt-search-panel-clear')),
  };
})()`;

// Panel-chrome (panel-chrome.js) state: the collapsed class + width custom
// property on <html>, plus the visibility/aria of the toggle and reopen tab.
// display-based visibility (not offsetParent) because the reopen tab is fixed.
const chromeState = `(() => {
  const root = document.documentElement;
  const disp = (el) => el ? getComputedStyle(el).display : 'none';
  const panel = document.getElementById('yt-search-panel-ext');
  const reopen = document.getElementById('yt-search-panel-reopen');
  const collapseBtn = document.querySelector('.yt-search-panel-collapse');
  return {
    collapsed: root.classList.contains('ytsp-collapsed'),
    panelVisible: disp(panel) !== 'none',
    reopenVisible: disp(reopen) !== 'none',
    collapseExpanded: collapseBtn && collapseBtn.getAttribute('aria-expanded'),
    reopenHidden: reopen && reopen.getAttribute('aria-hidden'),
    // The tab's extension icon only loads while it stays in web_accessible_resources.
    reopenIconLoaded: !!reopen?.querySelector('img')?.naturalWidth,
    focused: document.activeElement && (document.activeElement.id || document.activeElement.className),
    width: parseInt(root.style.getPropertyValue('--yt-panel-width'), 10) || null,
    innerWidth: window.innerWidth,
  };
})()`;

// Pick a query for the text-filter step: the most common ≥3-char word across the
// shown titles that doesn't appear in *every* one — so filtering on it both keeps
// some rows and drops others. Returns null if the titles share no such word.
function pickNeedle(titles) {
  const total = titles.length;
  const freq = {};
  titles.forEach((t) => {
    const seen = new Set();
    (t.toLowerCase().match(/[a-z0-9]+/g) || []).forEach((w) => {
      if (w.length >= 3 && !seen.has(w)) {
        seen.add(w);
        freq[w] = (freq[w] || 0) + 1;
      }
    });
  });
  const narrowing = Object.keys(freq)
    .filter((w) => freq[w] >= 1 && freq[w] < total)
    .sort((a, b) => freq[b] - freq[a]);
  return narrowing[0] || null;
}

// Mirror of panel-chrome.js clampWidth (config.js: MIN 280, MAX 760, keep 480 for
// YouTube), so a drag's resulting width is predictable from the cursor position.
function expectWidth(innerWidth, px) {
  const max = Math.min(760, Math.max(280, innerWidth - 480));
  return Math.min(max, Math.max(280, Math.round(px)));
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const base = path.join(os.homedir(), ".cache/ms-playwright");
  let best = null;
  let bestVer = -1;
  try {
    for (const d of fs.readdirSync(base)) {
      const m = /^chromium-(\d+)$/.exec(d); // full chromium only, not headless_shell
      if (!m) continue;
      const bin = path.join(base, d, "chrome-linux64", "chrome");
      if (fs.existsSync(bin) && Number(m[1]) > bestVer) {
        bestVer = Number(m[1]);
        best = bin;
      }
    }
  } catch {}
  return best;
}

// Playwright talks to Chrome over a pipe, so no DevTools port is open to other
// local processes.
function launchChrome(bin) {
  return chromium.launchPersistentContext(PROFILE, {
    executablePath: bin,
    headless: true,
    chromiumSandbox: true,
    viewport: null,
    args: ["--disable-extensions-except=" + EXT, "--load-extension=" + EXT, "--disable-gpu"],
  });
}

// Scroll the list to the bottom to drive auto-paging until `ready(state)` holds
// (or we run out of tries). Gentle, to limit Discogs requests.
async function pageUntil(page, ready, tries) {
  for (let i = 0; i < tries; i++) {
    const s = await page.evaluate(panelState);
    if (ready(s)) return s;
    await page.evaluate(`(() => {
      const el = document.querySelector('.yt-search-panel-releases');
      if (el) el.scrollTop = el.scrollHeight;
    })()`);
    await sleep(1600);
  }
  return page.evaluate(panelState);
}

// Drag the left edge by dx CSS px via a real mouse gesture (negative dx grows it),
// so panel-chrome's mousedown→move→up path runs. Grabs the handle mid-height to
// clear YouTube's fixed masthead. Returns the edge's final clientX.
async function dragResize(page, dx) {
  const box = await page.locator(".yt-search-panel-resize").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + Math.min(box.height / 2, 400);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy, { steps: 10 });
  await page.mouse.up();
  return cx + dx;
}

async function run(page) {
  // Count Discogs artist lookups, to prove a recent-artist pick skips one. The
  // content script's fetches are same-frame, so they surface here; the "are
  // observable" check below keeps a silent zero from faking a pass.
  let searchCalls = 0;
  page.on("request", (r) => {
    if (r.url().startsWith("https://api.discogs.com/database/search")) searchCalls++;
  });

  // 1. Panel injected on a plain YouTube page.
  await page.goto("https://www.youtube.com/?hl=en&gl=US", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("ytd-app", { timeout: 30000 });
  check("panel injected", await waitOk(() =>
    page.waitForSelector("#yt-search-panel-ext", { timeout: 15000 })));

  // 2. Typeahead suggests the artist. A spinner (aria-busy) shows during the
  // lookup, then clears. The 500ms debounce keeps the loading window observable.
  await page.fill(".yt-search-panel-input", "Daft Punk");
  const spinnerShown = await waitOk(() => page.waitForFunction(`(() => {
    const sp = document.querySelector('.yt-search-panel-spinner');
    const inp = document.querySelector('.yt-search-panel-input');
    return sp && !sp.hidden && inp.getAttribute('aria-busy') === 'true';
  })()`, { timeout: 5000 }));
  check("typeahead shows a spinner while searching", spinnerShown);

  const gotSuggestions = await waitOk(() =>
    page.waitForSelector(".yt-search-panel-result", { timeout: 15000 }));
  const suggestions = gotSuggestions
    ? await page.evaluate(`[...document.querySelectorAll('.yt-search-panel-result')]
        .map(e => e.textContent.trim())`)
    : [];
  check("typeahead suggests the artist", suggestions.includes("Daft Punk"),
    JSON.stringify(suggestions));

  // The spinner clears once the suggestions land.
  const spinnerCleared = await waitOk(() => page.waitForFunction(`(() => {
    const sp = document.querySelector('.yt-search-panel-spinner');
    const inp = document.querySelector('.yt-search-panel-input');
    return sp && sp.hidden && inp.getAttribute('aria-busy') === 'false';
  })()`, { timeout: 15000 }));
  check("spinner clears once suggestions arrive", spinnerCleared);
  check("Discogs artist lookups are observable", searchCalls > 0, "calls=" + searchCalls);

  // 2b. Dropdown highlight: ArrowDown/Up move the 'active' suggestion. Assert the
  // position only, then select by click below to keep the exact "Daft Punk" match.
  const activeSuggestion = `(() => {
    const lis = [...document.querySelectorAll('.yt-search-panel-result')];
    return { count: lis.length, activeIdx: lis.findIndex(l => l.classList.contains('active')) };
  })()`;
  await page.focus(".yt-search-panel-input");
  await page.keyboard.press("ArrowDown");
  let hl = await page.evaluate(activeSuggestion);
  check("ArrowDown highlights the first suggestion", hl.activeIdx === 0, JSON.stringify(hl));
  if (hl.count >= 2) {
    await page.keyboard.press("ArrowDown");
    hl = await page.evaluate(activeSuggestion);
    check("ArrowDown moves the highlight down", hl.activeIdx === 1, JSON.stringify(hl));
    await page.keyboard.press("ArrowUp");
    hl = await page.evaluate(activeSuggestion);
    check("ArrowUp moves the highlight back up", hl.activeIdx === 0, JSON.stringify(hl));
  }

  // 3. Selecting the artist loads releases; default = Releases, role row hidden.
  const exact = page.locator(".yt-search-panel-result", { hasText: /^Daft Punk$/ });
  await ((await exact.count()) ? exact.first()
    : page.locator(".yt-search-panel-result").first()).click();
  await waitOk(() => page.waitForSelector(".yt-rel", { timeout: 20000 }));
  await sleep(1200);
  let s = await page.evaluate(panelState);
  check("releases load", s.rowCount > 0, "rows=" + s.rowCount);
  check("default category is Releases",
    !!s.filters && s.filters.chips.includes("Releases*"), JSON.stringify(s.filters));
  check("role sub-row hidden for single-role category",
    !!s.subfilters && s.subfilters.hidden, JSON.stringify(s.subfilters));

  // 3b. List keyboard nav: ArrowDown from the box focuses the first row
  // (focusFirst), arrows rove, ArrowUp from the first row returns to the box.
  // Ends on the box for the next step; avoids the last row (auto-pages).
  const activeRow = `(() => {
    const a = document.activeElement;
    return {
      isRow: !!a && a.classList.contains('yt-rel'),
      isInput: !!a && a.classList.contains('yt-search-panel-input'),
      idx: (a && a.classList.contains('yt-rel'))
        ? [...document.querySelectorAll('.yt-rel')].indexOf(a) : -1,
    };
  })()`;
  await page.focus(".yt-search-panel-input");
  await page.keyboard.press("ArrowDown");
  let nav = await page.evaluate(activeRow);
  check("ArrowDown from the artist box focuses the first release row",
    nav.isRow && nav.idx === 0, JSON.stringify(nav));
  if (s.rowCount >= 2) {
    await page.keyboard.press("ArrowDown");
    nav = await page.evaluate(activeRow);
    check("ArrowDown roves to the next row", nav.isRow && nav.idx === 1, JSON.stringify(nav));
    await page.keyboard.press("ArrowUp");
    nav = await page.evaluate(activeRow);
    check("ArrowUp roves back to the previous row", nav.isRow && nav.idx === 0, JSON.stringify(nav));
  }
  await page.keyboard.press("ArrowUp");
  nav = await page.evaluate(activeRow);
  check("ArrowUp from the first row returns focus to the artist box",
    nav.isInput, JSON.stringify(nav));

  // 4. Text filter narrows to titles containing the query; Esc clears it. Done on
  // the Releases list and cleared before the chip steps so it doesn't carry over.
  const needle = pickNeedle(s.titles);
  check("a filterable title word was found", !!needle,
    JSON.stringify(s.titles.slice(0, 6)));
  if (needle) {
    await page.fill(".yt-rel-filter-input", needle);
    await sleep(500);
    const f = await page.evaluate(panelState);
    const nlc = needle.toLowerCase();
    check("text filter narrows to matching titles",
      f.rowCount > 0 && f.titles.every((t) => t.toLowerCase().includes(nlc)),
      "needle=" + needle + " titles=" + JSON.stringify(f.titles.slice(0, 6)));
    check("text filter actually narrowed the list",
      f.rowCount < s.rowCount, s.rowCount + " -> " + f.rowCount);

    // Esc runs the keydown clear handler; the full list should come back.
    await page.locator(".yt-rel-filter-input").press("Escape");
    await sleep(800);
    const c = await page.evaluate(panelState);
    check("clearing the filter restores the list",
      c.filterValue === "" && c.rowCount >= s.rowCount,
      "value=" + JSON.stringify(c.filterValue) + " rows=" + c.rowCount);
  }

  // 5. Category filter → Credits; page until the role sub-chips build.
  await page.locator(".yt-rel-filter", { hasText: /^Credits$/ }).click();
  await sleep(1200);
  s = await pageUntil(page,
    (st) => st.subfilters && !st.subfilters.hidden && st.subfilters.chips.length >= 2, 6);
  check("Credits category active",
    !!s.filters && s.filters.chips.includes("Credits*"), JSON.stringify(s.filters));
  check("role sub-chips appear under Credits",
    !!s.subfilters && !s.subfilters.hidden && s.subfilters.chips.includes("Remixes"),
    JSON.stringify(s.subfilters));

  // 6. Role sub-filter → Remixes narrows the list to Remix-role entries.
  await page.locator(".yt-rel-subfilter", { hasText: /^Remixes$/ }).click();
  await sleep(1500);
  s = await page.evaluate(panelState);
  const allRemix = s.metas.length > 0 && s.metas.every((m) => /Remix/.test(m));
  check("Remixes role active",
    !!s.subfilters && s.subfilters.chips.includes("Remixes*"), JSON.stringify(s.subfilters));
  check("list narrowed to the chosen role", allRemix, JSON.stringify(s.metas.slice(0, 4)));

  // 7. Feedback link: a mailto at the bottom of the panel, addressed to the dev.
  const feedbackHref = await page.evaluate(
    `(document.querySelector('.yt-search-panel-feedback') || {}).href || ''`);
  check("feedback mailto link present",
    /^mailto:samuelgomezcrespo@gmail\.com/.test(feedbackHref), "href=" + feedbackHref);

  // 8. Activating a release drives YouTube's search box and fills "Other artists".
  // The section fills synchronously, so capture the panel before the async nav.
  await page.locator(".yt-rel").first().click();
  await sleep(800);
  const after = await page.evaluate(panelState);
  check("activating a release fills the Other artists heading",
    /^Other artists on /.test(after.otherHeading || ""), "heading=" + after.otherHeading);
  check("Other artists section resolves",
    after.otherRows > 0 || /no other artists/i.test(after.otherEmpty || ""),
    "rows=" + after.otherRows + " empty=" + JSON.stringify(after.otherEmpty));

  // The query uses the release's own credited artist, not the searched one, and
  // drops a bare "Various" — so assert a non-empty query that isn't "Various …".
  const searched = await waitOk(() =>
    page.waitForFunction(
      `!!new URLSearchParams(location.search).get('search_query')`, { timeout: 15000 }));
  const q = searched
    ? await page.evaluate(`new URLSearchParams(location.search).get('search_query')`)
    : null;
  check("activating a release runs a YouTube search",
    searched && !!q && !/^various\b/i.test(q), "query=" + q);

  // 9. Panel chrome (panel-chrome.js): collapse/reopen hides and restores the
  // panel (aria + floating tab), drag resizes it, and width + collapsed state
  // survive a reload (chrome.storage.local). The panel survives step 8's SPA nav.
  let cs = await page.evaluate(chromeState);
  const startWidth = cs.width;

  // Collapse hides the panel and reveals the reopen tab.
  await page.locator(".yt-search-panel-collapse").click();
  await sleep(300);
  cs = await page.evaluate(chromeState);
  check("collapse hides the panel and shows the reopen tab",
    cs.collapsed && !cs.panelVisible && cs.reopenVisible, JSON.stringify(cs));
  check("collapse flips the toggle/tab aria state",
    cs.collapseExpanded === "false" && cs.reopenHidden === "false", JSON.stringify(cs));
  check("the reopen tab shows the extension icon",
    cs.reopenIconLoaded, JSON.stringify(cs));
  // Collapsing also focuses the reopen tab, but that isn't asserted: widening the
  // page re-renders YouTube's masthead, which restores focus to its own search
  // button about half a second later when a search just ran (as it has, step 8).

  // The reopen tab brings the panel back and hides itself again.
  await page.locator("#yt-search-panel-reopen").click();
  await sleep(300);
  cs = await page.evaluate(chromeState);
  check("reopen tab restores the panel",
    !cs.collapsed && cs.panelVisible && !cs.reopenVisible, JSON.stringify(cs));
  check("reopen restores the aria state",
    cs.collapseExpanded === "true" && cs.reopenHidden === "true", JSON.stringify(cs));
  check("reopen puts the caret in the artist box",
    cs.focused === "yt-search-panel-input", JSON.stringify(cs));

  // Dragging the left edge outward widens the panel to the cursor position.
  const edgeX = await dragResize(page, -120);
  await sleep(300);
  cs = await page.evaluate(chromeState);
  const expected = expectWidth(cs.innerWidth, cs.innerWidth - edgeX);
  check("dragging the edge resized the panel",
    cs.width > startWidth, startWidth + " -> " + cs.width);
  check("drag landed on the expected width",
    cs.width != null && Math.abs(cs.width - expected) <= 2,
    "got " + cs.width + " expected ~" + expected);

  // Keyboard resize: focus the grip and nudge. ArrowLeft grows, ArrowRight shrinks,
  // by 16px (40 with Shift), mirroring panel-chrome.js. Final width feeds the
  // persistence check below.
  await page.focus(".yt-search-panel-resize");
  let w0 = cs.width;
  await page.keyboard.press("ArrowRight");
  await sleep(150);
  cs = await page.evaluate(chromeState);
  check("ArrowRight shrinks the panel one step",
    cs.width === expectWidth(cs.innerWidth, w0 - 16), w0 + " -> " + cs.width);
  w0 = cs.width;
  await page.keyboard.press("ArrowLeft");
  await sleep(150);
  cs = await page.evaluate(chromeState);
  check("ArrowLeft grows the panel one step",
    cs.width === expectWidth(cs.innerWidth, w0 + 16), w0 + " -> " + cs.width);
  w0 = cs.width;
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await sleep(150);
  cs = await page.evaluate(chromeState);
  check("Shift+ArrowLeft grows the panel a bigger step",
    cs.width === expectWidth(cs.innerWidth, w0 + 40), w0 + " -> " + cs.width);

  // Collapse, reload, and confirm both the resized width and the collapsed state
  // are restored — proving they were persisted to chrome.storage.local.
  const savedWidth = cs.width;
  await page.locator(".yt-search-panel-collapse").click();
  await sleep(400);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("ytd-app", { timeout: 30000 });
  await waitOk(() => page.waitForSelector("#yt-search-panel-ext", { timeout: 15000 }));
  // The stored state is applied from chrome.storage's async get() callback, which
  // runs after the panel injects — wait for the collapsed class to reappear.
  const persisted = await waitOk(() => page.waitForFunction(
    `document.documentElement.classList.contains("ytsp-collapsed")`, { timeout: 15000 }));
  cs = await page.evaluate(chromeState);
  check("collapsed state persists across reload", persisted && cs.collapsed,
    JSON.stringify(cs));
  check("panel width persists across reload", cs.width === savedWidth,
    "saved=" + savedWidth + " restored=" + cs.width);

  // 10. Recent artists (history.js): the artists picked so far are stored, and
  // an empty artist box offers them back. The panel is still collapsed from the
  // reload above, so reopening focuses an empty box — the trigger.
  await page.locator("#yt-search-panel-reopen").click();
  // The stored list arrives from chrome.storage's async get(), which can land
  // after the focus that opened the (then empty) dropdown; history.js re-renders.
  const historyShown = await waitOk(() => page.waitForFunction(`(() => {
    const ul = document.querySelector('.yt-search-panel-results');
    return ul && !ul.hidden && ul.classList.contains('ytsp-history-mode');
  })()`, { timeout: 10000 }));
  let d = await page.evaluate(dropdownState);
  check("focusing the empty box offers the recent artists",
    historyShown && d.open && d.historyMode && d.expanded === "true", JSON.stringify(d));
  check("the recent list survived the reload",
    d.entries.includes("Daft Punk"), JSON.stringify(d.entries));
  check("the recent list offers a clear-all row", d.hasClearAll, JSON.stringify(d));

  // Picking a recent artist goes straight to the releases — no artist lookup,
  // which is the point of storing the Discogs id rather than the typed query.
  const callsBefore = searchCalls;
  await page.locator(".yt-search-panel-history-name", { hasText: /^Daft Punk$/ }).first().click();
  await waitOk(() => page.waitForSelector(".yt-rel", { timeout: 20000 }));
  await sleep(800);
  s = await page.evaluate(panelState);
  d = await page.evaluate(dropdownState);
  check("picking a recent artist loads their releases",
    s.rowCount > 0 && d.inputValue === "Daft Punk", "rows=" + s.rowCount + " box=" + d.inputValue);
  check("picking a recent artist skips the Discogs lookup",
    searchCalls === callsBefore, callsBefore + " -> " + searchCalls);

  // A second artist, to tell the per-entry remove apart from the clear-all.
  await page.fill(".yt-search-panel-input", "Aphex Twin");
  await waitOk(() => page.waitForSelector(".yt-search-panel-result", { timeout: 15000 }));
  const aphex = page.locator(".yt-search-panel-result", { hasText: /^Aphex Twin$/ });
  await ((await aphex.count()) ? aphex.first()
    : page.locator(".yt-search-panel-result").first()).click();
  await waitOk(() => page.waitForSelector(".yt-rel", { timeout: 20000 }));
  await sleep(800);

  // Emptying the box brings the list back, newest pick first.
  await page.fill(".yt-search-panel-input", "");
  await sleep(300);
  d = await page.evaluate(dropdownState);
  check("emptying the box brings the recent list back",
    d.open && d.historyMode, JSON.stringify(d));
  check("recent artists list newest first",
    d.entries.length === 2 && /^Aphex Twin/.test(d.entries[0]) && d.entries[1] === "Daft Punk",
    JSON.stringify(d.entries));

  // The per-row × drops just that entry and leaves the dropdown up.
  await page.locator(".yt-search-panel-history-remove").first().click();
  await sleep(300);
  d = await page.evaluate(dropdownState);
  check("removing one recent artist leaves the rest",
    d.open && d.entries.length === 1 && d.entries[0] === "Daft Punk", JSON.stringify(d));

  // Clear-all empties the list and closes the dropdown; a fresh focus finds
  // nothing to offer.
  await page.locator(".yt-search-panel-clear").click();
  await sleep(300);
  d = await page.evaluate(dropdownState);
  check("clear-all closes the recent list", !d.open, JSON.stringify(d));
  await page.evaluate(`document.querySelector('.yt-search-panel-input').blur()`);
  await page.locator(".yt-search-panel-input").click();
  await sleep(300);
  d = await page.evaluate(dropdownState);
  check("an empty recent list opens nothing", !d.open && d.expanded === "false",
    JSON.stringify(d));
}

(async () => {
  const bin = findChrome();
  if (!bin) {
    console.error("No Chrome found. Set CHROME_BIN, or run: npx playwright-core install chromium");
    process.exit(2);
  }
  console.log("chrome:", bin);
  const context = await launchChrome(bin);
  try {
    await context.addCookies([
      { name: "CONSENT", value: "YES+1", domain: ".youtube.com", path: "/" },
      { name: "SOCS", value: "CAI", domain: ".youtube.com", path: "/" },
    ]);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await run(page);
  } finally {
    // close() waits for Chrome to exit, so Chrome no longer holds the profile.
    await context.close().catch(() => {});
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true });
    } catch {}
  }
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("E2E_ERROR:", e.stack || e.message);
  process.exit(1);
});
