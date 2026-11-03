// Captures a 1280x800 Chrome Web Store screenshot of the panel driving YouTube:
// search an artist, click a release, then shoot once YouTube's results and the
// panel's "Other artists" have filled. Reuses the e2e launch approach.
// Output: dist/screenshot-1280x800.png.
// Run: node test/screenshot.js  (finds a browser as the e2e test does; hits live
// YouTube + Discogs, like the e2e test).
const { chromium } = require("playwright-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const OUT = path.join(EXT, "dist", "screenshot-1280x800.png");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "yt-shot-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The package manager keeps a system browser patched, while Playwright's build moves only
// with a Playwright release. Google Chrome is left out: its branded builds ignore
// --load-extension.
const SYSTEM_BROWSERS = ["brave-browser", "chromium", "chromium-browser"];

function onPath(name) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const bin = path.join(dir, name);
    try {
      fs.accessSync(bin, fs.constants.X_OK);
      return bin;
    } catch (e) {}
  }
  return null;
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const system = SYSTEM_BROWSERS.map(onPath).find(Boolean);
  if (system) return system;
  const base = path.join(os.homedir(), ".cache/ms-playwright");
  let best = null;
  let bestVer = -1;
  try {
    for (const d of fs.readdirSync(base)) {
      const m = /^chromium-(\d+)$/.exec(d);
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

(async () => {
  const bin = findChrome();
  if (!bin) {
    console.error("No browser found. Install Brave or Chromium, set CHROME_BIN, or run: npx playwright-core install chromium");
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("https://www.youtube.com/?hl=en&gl=US", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("#yt-search-panel-ext", { timeout: 20000 });
    await page.fill(".yt-search-panel-input", "Daft Punk");
    await page.waitForSelector(".yt-search-panel-result", { timeout: 15000 });
    const exact = page.locator(".yt-search-panel-result", { hasText: /^Daft Punk$/ });
    await ((await exact.count()) ? exact.first() : page.locator(".yt-search-panel-result").first()).click();
    await page.waitForSelector(".yt-rel", { timeout: 20000 });
    await sleep(2000); // let the release list render

    // Click a release: drives YouTube's search box and fills "Other artists".
    await page.locator(".yt-rel").first().click();
    // Wait for the search to land and its results + the Other artists section.
    await page.waitForFunction(
      `!!new URLSearchParams(location.search).get('search_query')`,
      { timeout: 15000 }
    );
    await page.waitForSelector("ytd-video-renderer", { timeout: 20000 });
    await page.waitForFunction(
      `/^Other artists on /.test((document.querySelector('.yt-search-panel-subheading') || {}).textContent || '')`,
      { timeout: 15000 }
    );
    await sleep(2000); // let thumbnails paint

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT });
    console.log("wrote", OUT);
  } finally {
    // close() waits for Chrome to exit, so Chrome no longer holds the profile.
    await context.close().catch(() => {});
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true });
    } catch (e) {}
  }
})().catch((e) => {
  console.error("SHOT_ERROR:", e.stack || e.message);
  process.exit(1);
});
