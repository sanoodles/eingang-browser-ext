"use strict";

// Shared Conventional Commits helpers for the release scripts (recommend-bump +
// changelog): the commit range since the last v* tag, parsed into structured
// records, plus the semver-bump precedence and a GitHub commit-URL base.
// Zero-dep; reads `git log`.

const { execFileSync } = require("child_process");

function git(args, stderr = "inherit") {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", stderr],
  }).trim();
}

// The last v* tag, or null before the first tagged release.
function lastTag() {
  try {
    // ignore stderr: with no tags yet `describe` prints an expected fatal
    return git(["describe", "--tags", "--abbrev=0", "--match", "v*"], "ignore");
  } catch {
    return null;
  }
}

const HEADER = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.*)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:\s*(.*)$/m;
const RECORD = "\x1e"; // between commits
const FIELD = "\x1f"; //  between a commit's fields

// Commits since `tag` (or all history when null), newest first. Non-conventional
// messages come back too, with `type === null`, so callers can drop them.
function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  return git(["log", range, "--no-merges", `--format=%h${FIELD}%B${RECORD}`])
    .split(RECORD)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash, message = ""] = r.split(FIELD);
      const header = HEADER.exec(message.split("\n", 1)[0]);
      const footer = BREAKING_FOOTER.exec(message);
      return {
        hash,
        type: header ? header[1] : null,
        scope: header && header[2] ? header[2] : null,
        breaking: Boolean((header && header[3]) || footer),
        description: header ? header[4] : message.split("\n", 1)[0],
        breakingNote: footer ? footer[1] : null,
      };
    });
}

// major | minor | patch from the standard precedence.
function recommendBump(commits) {
  let bump = "patch";
  for (const c of commits) {
    if (c.breaking) return "major";
    if (c.type === "feat") bump = "minor";
  }
  return bump;
}

// https base for linking commits, derived from the origin remote; null if it
// isn't a GitHub remote (callers fall back to a bare hash).
function repoUrl() {
  let url;
  try {
    url = git(["remote", "get-url", "origin"], "ignore");
  } catch {
    return null;
  }
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}` : null;
}

module.exports = { lastTag, commitsSince, recommendBump, repoUrl };
