"use strict";

// Run by the npm `version` lifecycle hook (after package.json is bumped, before
// the commit/tag): copy package.json's version into manifest.json so the two
// never drift. A targeted replace keeps manifest.json's hand-formatting intact.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

const manifestPath = path.join(root, "manifest.json");
const before = fs.readFileSync(manifestPath, "utf8");
const after = before.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
if (after === before && !before.includes(`"version": "${version}"`)) {
  throw new Error("manifest.json: could not find a version field to update");
}

fs.writeFileSync(manifestPath, after);
console.log(`manifest.json version -> ${version}`);
