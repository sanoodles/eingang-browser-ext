"use strict";

// Prepend the just-bumped version's release notes to CHANGELOG.md. Run by the
// npm `version` hook, so package.json already holds the new version and the
// release commit isn't made yet — the notes summarize the Conventional Commits
// since the last v* tag. A non-conventional commit message keeps that commit out
// of the changelog. Zero-dep.

const fs = require("fs");
const path = require("path");

const { lastTag, commitsSince, repoUrl } = require("./conventional");

const root = path.join(__dirname, "..");
const changelogPath = path.join(root, "CHANGELOG.md");
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

const PREAMBLE = `# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the notes are generated from
[Conventional Commits](https://www.conventionalcommits.org/) — a commit written
without a conventional type is intentionally left out.`;

// The standard Conventional Commit types, type -> heading, in render order. Only
// these surface in the changelog; any other prefix (or none) is treated as
// non-conventional and left out — that's the escape hatch for hiding a commit.
const SECTIONS = [
  ["feat", "Features"],
  ["fix", "Bug Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactoring"],
  ["docs", "Documentation"],
  ["build", "Build"],
  ["ci", "CI"],
  ["test", "Tests"],
  ["style", "Styles"],
  ["chore", "Chores"],
  ["revert", "Reverts"],
];
const KNOWN = new Set(SECTIONS.map(([t]) => t));

const base = repoUrl();
const tag = lastTag();
const commits = commitsSince(tag).filter((c) => KNOWN.has(c.type));

function link(hash) {
  const code = `\`${hash}\``;
  return base ? `[${code}](${base}/commit/${hash})` : code;
}

function bullet(text, hash) {
  return `- ${text} (${link(hash)})`;
}

function entry(c, text = c.description) {
  return bullet(c.scope ? `**${c.scope}:** ${text}` : text, c.hash);
}

const blocks = [];

const breaking = commits.filter((c) => c.breaking);
if (breaking.length) {
  blocks.push(
    "### ⚠ BREAKING CHANGES\n\n" +
      breaking.map((c) => entry(c, c.breakingNote || c.description)).join("\n")
  );
}

for (const [type, heading] of SECTIONS) {
  const list = commits.filter((c) => c.type === type);
  if (list.length) {
    blocks.push(`### ${heading}\n\n` + list.map((c) => entry(c)).join("\n"));
  }
}

const date = new Date().toISOString().slice(0, 10);
const body = blocks.length ? blocks.join("\n\n") : "_No notable changes._";
const block = `## [${version}] - ${date}\n\n${body}`;

const existing = fs.existsSync(changelogPath)
  ? fs.readFileSync(changelogPath, "utf8")
  : "";

if (existing.includes(`## [${version}]`)) {
  console.log(`CHANGELOG.md already lists ${version} — leaving it`);
  process.exit(0);
}

// Keep the preamble; insert the new block above the previous version entries.
const firstEntry = existing.search(/^## /m);
let output;
if (!existing.trim()) {
  output = `${PREAMBLE}\n\n${block}\n`;
} else if (firstEntry === -1) {
  output = `${existing.replace(/\s+$/, "")}\n\n${block}\n`;
} else {
  const preamble = existing.slice(0, firstEntry).replace(/\s+$/, "");
  const older = existing.slice(firstEntry).replace(/\s+$/, "");
  output = `${preamble}\n\n${block}\n\n${older}\n`;
}

fs.writeFileSync(changelogPath, output);
console.log(`CHANGELOG.md += ${version} (${commits.length} entr${commits.length === 1 ? "y" : "ies"})`);
