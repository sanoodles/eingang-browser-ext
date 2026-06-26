"use strict";

// Recommend the next semver bump (major|minor|patch) from the Conventional
// Commits since the last v* tag — the default the `release` npm script feeds to
// `npm version` (`BUMP=...` overrides it). Only the keyword goes to stdout so
// `$(...)` can capture it; the reasoning goes to stderr.

const { lastTag, commitsSince, recommendBump } = require("./conventional");

const tag = lastTag();
const commits = commitsSince(tag);
const bump = recommendBump(commits);

process.stderr.write(
  `recommend-bump: ${bump} (from ${commits.length} commit(s) since ${tag || "the start"})\n`
);
process.stdout.write(`${bump}\n`);
