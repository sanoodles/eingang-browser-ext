"use strict";

// Package the extension for the Chrome Web Store: zip exactly the files the
// store needs (the same set the manifest loads, plus the icons and license) into
// dist/eingang-<version>.zip. This is packaging only — the extension itself has
// no build step; the source loads as-is.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

const FILES = ["manifest.json", "icons", "src", "css", "LICENSE"];
const out = path.join(root, "dist", `eingang-${version}.zip`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });

try {
  execFileSync("zip", ["-r", out, ...FILES], { cwd: root, stdio: "inherit" });
} catch (err) {
  if (err.code === "ENOENT") {
    console.error("`zip` not found — install it (e.g. `sudo dnf install zip`).");
    process.exit(1);
  }
  throw err;
}

console.log(`built ${path.relative(root, out)}`);
