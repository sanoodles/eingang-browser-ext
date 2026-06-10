// End-to-end test of the full panel journey on real YouTube:
//   typeahead search → artist select → release list (default Releases filter)
//   → category filter (Credits) → role sub-filter (Remixes) → activate a
//   release (drives YouTube's own search).
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
  };
})()`;

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

async function run(page) {
  // 1. Panel injected on a plain YouTube page.
  await page.goto("https://www.youtube.com/?hl=en&gl=US", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("ytd-app", { timeout: 30000 });
  check("panel injected", await waitOk(() =>
    page.waitForSelector("#yt-search-panel-ext", { timeout: 15000 })));

  // 2. Typeahead returns suggestions including the artist.
  await page.fill(".yt-search-panel-input", "Daft Punk");
  const gotSuggestions = await waitOk(() =>
    page.waitForSelector(".yt-search-panel-result", { timeout: 15000 }));
  const suggestions = gotSuggestions
    ? await page.evaluate(`Array.prototype.map.call(
        document.querySelectorAll('.yt-search-panel-result'), e => e.textContent.trim())`)
    : [];
  check("typeahead suggests the artist", suggestions.includes("Daft Punk"),
    JSON.stringify(suggestions));

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

  // 4. Category filter → Credits; page until the role sub-chips build.
  await page.locator(".yt-rel-filter", { hasText: /^Credits$/ }).click();
  await sleep(1200);
  s = await pageUntil(page,
    (st) => st.subfilters && !st.subfilters.hidden && st.subfilters.chips.length >= 2, 6);
  check("Credits category active",
    !!s.filters && s.filters.chips.includes("Credits*"), JSON.stringify(s.filters));
  check("role sub-chips appear under Credits",
    !!s.subfilters && !s.subfilters.hidden && s.subfilters.chips.includes("Remixes"),
    JSON.stringify(s.subfilters));

  // 5. Role sub-filter → Remixes narrows the list to Remix-role entries.
  await page.locator(".yt-rel-subfilter", { hasText: /^Remixes$/ }).click();
  await sleep(1500);
  s = await page.evaluate(panelState);
  const allRemix = s.metas.length > 0 && s.metas.every((m) => /Remix/.test(m));
  check("Remixes role active",
    !!s.subfilters && s.subfilters.chips.includes("Remixes*"), JSON.stringify(s.subfilters));
  check("list narrowed to the chosen role", allRemix, JSON.stringify(s.metas.slice(0, 4)));

  // 6. Activating a release drives YouTube's own search box. The query uses the
  // release's own credited artist, not the searched one, and drops a bare
  // "Various" — so assert a non-empty query that isn't "Various …".
  await page.locator(".yt-rel").first().click();
  const searched = await waitOk(() =>
    page.waitForFunction(
      `!!new URLSearchParams(location.search).get('search_query')`, { timeout: 15000 }));
  const q = searched
    ? await page.evaluate(`new URLSearchParams(location.search).get('search_query')`)
    : null;
  check("activating a release runs a YouTube search",
    searched && !!q && !/^various\b/i.test(q), "query=" + q);
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
