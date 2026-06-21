"use strict";

// One command to cut a release: bump the version (commits + tags via npm, and
// syncs manifest.json through the `version` hook), build the zip, then upload and
// publish to the Chrome Web Store.
//
//   npm run release            # patch (1.1.0 -> 1.1.1)
//   npm run release -- minor   # 1.1.0 -> 1.2.0
//   npm run release -- 2.0.0   # explicit version
//
// The git commit and tag stay local; push them with `git push --follow-tags`.

const { execFileSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const bump = process.argv[2] || "patch";
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

run("npm", ["version", bump, "-m", "Bump version to %s"]);
run("npm", ["run", "build"]);
run("npm", ["run", "ship"]);

console.log("\nRelease done. Push it with: git push --follow-tags");
