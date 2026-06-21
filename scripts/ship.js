"use strict";

// Upload dist/eingang-<version>.zip to the Chrome Web Store and publish it.
// Uses the Web Store API directly (no extra dependency) via a refresh-token
// OAuth flow. Set these env vars (see CLAUDE.md "Releasing"):
//
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN   (Google OAuth client)
//   CWS_EXTENSION_ID                                       (optional override)
//
// Publishing submits the new version for Google's review; it does not go live
// instantly.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const EXTENSION_ID =
  process.env.CWS_EXTENSION_ID || "panappbiijcinhelkocoealgmaoehiek";
const { CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;

const API = "https://www.googleapis.com";

function requireEnv(name, value) {
  if (value) return value;
  console.error(`Missing env ${name}. See CLAUDE.md "Releasing".`);
  process.exit(1);
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CWS_CLIENT_ID,
      client_secret: CWS_CLIENT_SECRET,
      refresh_token: CWS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function upload(token, zipPath) {
  const res = await fetch(
    `${API}/upload/chromewebstore/v1.1/items/${EXTENSION_ID}?uploadType=media`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "x-goog-api-version": "2" },
      body: fs.readFileSync(zipPath),
    }
  );
  const data = await res.json();
  if (!res.ok || data.uploadState === "FAILURE") {
    throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  }
  console.log(`uploaded ${path.basename(zipPath)} (${data.uploadState})`);
}

async function publish(token) {
  const res = await fetch(`${API}/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-api-version": "2",
      "Content-Length": "0",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Publish failed: ${JSON.stringify(data)}`);
  console.log(`publish status: ${(data.status || ["OK"]).join(", ")}`);
}

async function main() {
  requireEnv("CWS_CLIENT_ID", CWS_CLIENT_ID);
  requireEnv("CWS_CLIENT_SECRET", CWS_CLIENT_SECRET);
  requireEnv("CWS_REFRESH_TOKEN", CWS_REFRESH_TOKEN);

  const { version } = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  const zipPath = path.join(root, "dist", `eingang-${version}.zip`);
  if (!fs.existsSync(zipPath)) {
    console.error(`No build at ${path.relative(root, zipPath)} — run "npm run build" first.`);
    process.exit(1);
  }

  const token = await accessToken();
  await upload(token, zipPath);
  await publish(token);
  console.log(`shipped ${version} to the Chrome Web Store (submitted for review)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
