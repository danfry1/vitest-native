#!/usr/bin/env node
// Prints the "Thank you" paragraph for a release's notes: everyone outside the maintainer
// who opened an issue that was fixed (closed as completed), or a pull request that was
// merged, in the release.
//
//   node scripts/release-thanks.mjs --release 0.14.1     # issues and PRs in that milestone
//   node scripts/release-thanks.mjs --since v0.13.0      # closed since a tag (or an ISO date)
//
// The maintainer and bots are left out; handles are listed alphabetically as links. The
// output is Markdown for pasting into CHANGELOG.md and the release-notes page; nothing is
// written. Check it before pasting: a reporter who asked not to be named is removed by hand.
//
// Set GITHUB_TOKEN (for example `GITHUB_TOKEN=$(gh auth token)`) to avoid the
// unauthenticated rate limit.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = "danfry1/vitest-native";
export const MAINTAINER = "danfry1";

/**
 * Whether an item from GitHub's issues endpoint (issues and pull requests) credits its
 * author: an issue closed as completed (not as not planned or a duplicate), or a pull
 * request that was merged, opened by someone other than the maintainer or a bot.
 *
 * @param {{ user?: { login: string, type?: string } | null, state?: string, state_reason?: string | null,
 *   pull_request?: { merged_at?: string | null } }} item
 */
export function credits(item) {
  const user = item.user;
  if (!user || user.login === MAINTAINER) return false;
  if (user.type === "Bot" || user.login.endsWith("[bot]")) return false;
  if (item.pull_request !== undefined) return Boolean(item.pull_request.merged_at);
  return item.state === "closed" && item.state_reason === "completed";
}

/**
 * The "Thank you" paragraph for the items GitHub lists, or null when nobody is credited.
 *
 * @param {Parameters<typeof credits>[0][]} items
 * @returns {string | null}
 */
export function thankYou(items) {
  const handles = [...new Set(items.filter(credits).map((item) => item.user.login))].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
  if (handles.length === 0) return null;
  const links = handles.map((handle) => `[@${handle}](https://github.com/${handle})`);
  const list =
    links.length === 1 ? links[0] : `${links.slice(0, -1).join(", ")} and ${links.at(-1)}`;
  return `Thank you to ${list} for the issues and pull requests in this release.`;
}

const headers = { accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function get(path) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub responded ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

// Every page of a list endpoint.
async function all(path) {
  const items = [];
  for (let page = 1; ; page++) {
    const batch = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`Expected a list from ${path}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

/** An ISO date from `--since`: a date as given, or the date of a git tag. */
function sinceDate(value) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const res = spawnSync("git", ["log", "-1", "--format=%cI", value], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`--since ${value}: not a date or a git ref`);
  return res.stdout.trim();
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const [flag, value] = process.argv.slice(2);
  let items;
  if (flag === "--release" && value) {
    const milestone = (await all("milestones?state=all")).find((m) => m.title === value);
    if (!milestone) throw new Error(`No milestone titled ${value}`);
    items = await all(`issues?state=closed&milestone=${milestone.number}`);
  } else if (flag === "--since" && value) {
    const since = sinceDate(value);
    // `since` filters by last update; keep what was closed after the date. Compared as
    // dates: a tag's date carries an offset, GitHub's are UTC.
    const from = Date.parse(since);
    items = (await all(`issues?state=closed&since=${encodeURIComponent(since)}`)).filter(
      (item) => item.closed_at && Date.parse(item.closed_at) >= from,
    );
  } else {
    console.error(
      "usage: node scripts/release-thanks.mjs --release <milestone>\n" +
        "       node scripts/release-thanks.mjs --since <tag-or-ISO-date>",
    );
    process.exit(1);
  }
  console.log(
    thankYou(items) ?? "Nobody outside the maintainer opened an issue or a pull request.",
  );
}
