#!/usr/bin/env node
// Rewrites the contributors list in README.md.
//
// Anyone who has opened an issue or a pull request on the repository counts, and so does
// anyone whose commits landed without one of their own (a commit carried over from
// another pull request), listed in the order they first contributed. The maintainer and
// bots are left out. The list sits between the `contributors:start` and
// `contributors:end` markers; everything else in the README is left as it is.
//
//   node scripts/contributors.mjs
//
// Nothing in CI runs it, so a pull request changing only it and README.md is docs-only
// (.github/scripts/classify-change.sh) and skips the test matrix.
//
// Set GITHUB_TOKEN (for example `GITHUB_TOKEN=$(gh auth token)`) to avoid the
// unauthenticated rate limit.
import { readFile, writeFile } from "node:fs/promises";

const REPO = "danfry1/vitest-native";
const MAINTAINER = "danfry1";
const README = new URL("../README.md", import.meta.url);
const START = "<!-- contributors:start -->";
const END = "<!-- contributors:end -->";

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

const counted = (user) => user && user.login !== MAINTAINER && user.type !== "Bot";

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function render(contributors) {
  if (contributors.length === 0)
    return "None yet. Open an issue or a pull request to be the first.";
  const cells = contributors.map((c) => {
    const kinds = [
      c.issues > 0 ? plural(c.issues, "issue") : "",
      c.pulls > 0 ? plural(c.pulls, "pull request") : "",
      c.issues === 0 && c.pulls === 0 ? plural(c.commits, "commit") : "",
    ]
      .filter(Boolean)
      .join(", ");
    const link =
      c.issues > 0 || c.pulls > 0
        ? `https://github.com/search?q=repo%3A${encodeURIComponent(REPO)}+author%3A${c.login}&type=issues`
        : `https://github.com/${REPO}/commits?author=${c.login}`;
    return [
      '    <td align="center" valign="top" width="120">',
      `      <a href="https://github.com/${c.login}"><img src="https://github.com/${c.login}.png?size=128" width="64" height="64" alt="${c.login}" /><br /><sub><b>${c.login}</b></sub></a><br />`,
      `      <sub><a href="${link}">${kinds}</a></sub>`,
      "    </td>",
    ].join("\n");
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 6) {
    rows.push(`  <tr>\n${cells.slice(i, i + 6).join("\n")}\n  </tr>`);
  }
  return `<table>\n${rows.join("\n")}\n</table>`;
}

const byLogin = new Map();
const entry = (login) => {
  let found = byLogin.get(login);
  if (!found) {
    found = { login, first: null, issues: 0, pulls: 0, commits: 0 };
    byLogin.set(login, found);
  }
  return found;
};
const seen = (contributor, date) => {
  if (date && (contributor.first === null || date < contributor.first)) contributor.first = date;
};

// Issues and pull requests (the issues endpoint lists both).
for (const item of await all("issues?state=all")) {
  if (!counted(item.user)) continue;
  const contributor = entry(item.user.login);
  if (item.pull_request === undefined) contributor.issues++;
  else contributor.pulls++;
  seen(contributor, item.created_at);
}

// Commit authors GitHub links to an account; the date of a commit-only contributor's
// first commit places them in the list.
for (const user of await all("contributors")) {
  if (!counted(user)) continue;
  const contributor = entry(user.login);
  contributor.commits = user.contributions;
  if (contributor.first === null) {
    const commits = await all(`commits?author=${encodeURIComponent(user.login)}`);
    for (const commit of commits) seen(contributor, commit.commit?.author?.date ?? null);
  }
}

const contributors = [...byLogin.values()].sort((a, b) =>
  (a.first ?? "").localeCompare(b.first ?? ""),
);

const readme = await readFile(README, "utf8");
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end < start) throw new Error(`README.md needs ${START} and ${END} markers`);
await writeFile(
  README,
  `${readme.slice(0, start + START.length)}\n${render(contributors)}\n${readme.slice(end)}`,
);
console.log(`README.md lists ${plural(contributors.length, "contributor")}`);
