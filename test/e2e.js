// End-to-end test of the full panel journey on real YouTube:
//   typeahead search (spinner while loading) → artist select
//   → release list (default Releases filter)
//   → text filter (narrow by title, then clear) → category filter (Credits)
//   → role sub-filter (Remixes) → feedback link present
//   → activate a release (drives YouTube's search + fills "Other artists")
//   → panel chrome (collapse/reopen toggle, drag-resize, persist across reload).
//
// It launches its own headless Chrome with the unpacked extension and tears it
// down. It hits live YouTube + the Discogs API, so it needs network and is
// subject to Discogs' unauthenticated rate limit (~25 requests/minute) — keep
// runs spaced out. Asserts accumulate; the process exits non-zero on any fail.
//
// Run:    npm run test:e2e        (or: node test/e2e.js)
// Chrome: set CHROME_BIN, or have Playwright's Chromium cached at
//         ~/.cache/ms-playwright/chromium-<n>/chrome-linux64/chrome
//         (install with: npx playwright install chromium).

const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const PORT = Number(process.env.CDP_PORT || 9222);
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "yt-e2e-"));
const CDP = "http://127.0.0.1:" + PORT;

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
  } catch (e) {
    return false;
  }
}

// The content script appends its UI to document.body, so the panel is readable
// from the MAIN world that page.evaluate runs in.
const panelState = `(() => {
  const q = (s) => document.querySelector(s);
  const chipInfo = (bar) => bar ? {
    hidden: !!bar.hidden,
    chips: Array.prototype.map.call(bar.children, b =>
      b.textContent.trim() + (b.classList.contains('active') ? '*' : ''))
  } : null;
  const rows = Array.prototype.slice.call(document.querySelectorAll('.yt-rel'));
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
  } catch (e) {}
  return best;
}

async function launchChrome(bin) {
  const proc = spawn(
    bin,
    [
      "--headless=new",
      "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + PROFILE,
      "--disable-extensions-except=" + EXT,
      "--load-extension=" + EXT,
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await waitOk(() => fetch(CDP + "/json/version").then((r) => {
      if (!r.ok) throw new Error("not ok");
    }))) {
      return proc;
    }
    await sleep(500);
  }
  proc.kill("SIGKILL");
  throw new Error("Chrome CDP did not come up on " + CDP);
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

// Drag the panel's left edge by dx CSS px with a real mouse gesture (negative dx
// grows the panel), so panel-chrome's mousedown→mousemove→mouseup path runs.
// Grabs the handle mid-height to stay clear of YouTube's fixed masthead. Returns
// the edge's final clientX, from which the expected width is innerWidth - x.
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
  // 1. Panel injected on a plain YouTube page.
  await page.goto("https://www.youtube.com/?hl=en&gl=US", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("ytd-app", { timeout: 30000 });
  check("panel injected", await waitOk(() =>
    page.waitForSelector("#yt-search-panel-ext", { timeout: 15000 })));

  // 2. Typeahead returns suggestions including the artist. A spinner shows over
  // the input (and aria-busy flips) while the lookup is in flight, then clears
  // once results render. The 500ms debounce keeps the loading window observable.
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
    ? await page.evaluate(`Array.prototype.map.call(
        document.querySelectorAll('.yt-search-panel-result'), e => e.textContent.trim())`)
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

  // 4. Text filter narrows the loaded list to titles containing the query, and
  // Esc clears it back to the full list. Done on the default Releases list, and
  // cleared before the chip steps so it doesn't carry over into them.
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

  // 8. Activating a release drives YouTube's own search box AND fills the
  // "Other artists" section. The section is populated synchronously on click, so
  // capture the panel before asserting the async navigation.
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

  // 9. Panel chrome (panel-chrome.js): the collapse/reopen toggle hides and
  // restores the panel (flipping aria + the floating tab), dragging the left edge
  // resizes it, and both the width and collapsed state survive a page reload
  // (persisted in chrome.storage.local). The panel survives the SPA navigation
  // from step 8, so its DOM is still here; the reload at the end re-injects it.
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

  // The reopen tab brings the panel back and hides itself again.
  await page.locator("#yt-search-panel-reopen").click();
  await sleep(300);
  cs = await page.evaluate(chromeState);
  check("reopen tab restores the panel",
    !cs.collapsed && cs.panelVisible && !cs.reopenVisible, JSON.stringify(cs));
  check("reopen restores the aria state",
    cs.collapseExpanded === "true" && cs.reopenHidden === "true", JSON.stringify(cs));

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
}

(async () => {
  const bin = findChrome();
  if (!bin) {
    console.error("No Chrome found. Set CHROME_BIN, or run: npx playwright install chromium");
    process.exit(2);
  }
  console.log("chrome:", bin);
  const proc = await launchChrome(bin);
  const browser = await chromium.connectOverCDP(CDP);
  try {
    const context = browser.contexts()[0];
    await context.addCookies([
      { name: "CONSENT", value: "YES+1", domain: ".youtube.com", path: "/" },
      { name: "SOCS", value: "CAI", domain: ".youtube.com", path: "/" },
    ]);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await run(page);
  } finally {
    await browser.close().catch(() => {});
    // Wait for Chrome to actually exit before removing its profile, else it's
    // still holding files and rmSync leaves the temp dir behind.
    await new Promise((res) => {
      proc.once("exit", res);
      proc.kill("SIGTERM");
      setTimeout(() => {
        proc.kill("SIGKILL");
        res();
      }, 3000);
    });
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true });
    } catch (e) {}
  }
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("E2E_ERROR:", e.stack || e.message);
  process.exit(1);
});
