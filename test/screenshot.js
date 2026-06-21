// Captures a 1280x800 Chrome Web Store screenshot of the populated panel on real
// YouTube, reusing the e2e launch approach. Output: dist/screenshot-1280x800.png.
// Run: node test/screenshot.js  (needs CHROME_BIN or a cached Playwright Chromium;
// hits live YouTube + Discogs, like the e2e test).
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT = path.resolve(__dirname, "..");
const OUT = path.join(EXT, "dist", "screenshot-1280x800.png");
const PORT = Number(process.env.CDP_PORT || 9223);
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "yt-shot-"));
const CDP = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitOk = async (fn) => {
  try {
    await fn();
    return true;
  } catch (e) {
    return false;
  }
};

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
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
    if (
      await waitOk(() =>
        fetch(CDP + "/json/version").then((r) => {
          if (!r.ok) throw new Error("not ok");
        })
      )
    ) {
      return proc;
    }
    await sleep(500);
  }
  proc.kill("SIGKILL");
  throw new Error("Chrome CDP did not come up on " + CDP);
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
    await sleep(2500); // let the release list render
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT });
    console.log("wrote", OUT);
  } finally {
    await browser.close().catch(() => {});
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
})().catch((e) => {
  console.error("SHOT_ERROR:", e.stack || e.message);
  process.exit(1);
});
