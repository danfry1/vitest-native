// Fails a pull request whose title or body uses a closing keyword on another pull request.
//
// GitHub closes every issue or pull request named after "fix", "fixes", "fixed", "close",
// "closes", "closed", "resolve", "resolves" or "resolved" in a merged change's message. A
// squash merge uses the pull request's title and body as that message, so "Fixes #612"
// written about a related pull request closed it, unmerged, when this one landed. Closing
// keywords are for issues; a related pull request is named without one ("after #612",
// "see #612").
//
//   GH_TOKEN=… REPO=owner/name PR_TITLE=… PR_BODY=… node scripts/check-closing-keywords.mjs
//
// Each referenced number is looked up through the GitHub API: an issue passes, a pull
// request (or a reference that cannot be resolved) fails, naming it.
import process from "node:process";

const KEYWORD = String.raw`\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+`;
const TARGET = String.raw`(?:([\w.-]+\/[\w.-]+)#|#|https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/)(\d+)`;

/**
 * Every "<keyword> <reference>" in `text`, as GitHub reads them: the keyword
 * case-insensitive, an optional colon, a reference in this repository (`#12`), another
 * (`owner/name#12`), or a full issue or pull request URL. Comma- or "and"-separated lists
 * after one keyword count too (GitHub closes each).
 */
export function closingReferences(text, repo) {
  const found = [];
  const pattern = new RegExp(`${KEYWORD}${TARGET}((?:\\s*(?:,|and)\\s*${TARGET})*)`, "gi");
  for (const match of text.matchAll(pattern)) {
    const keyword = match[1].toLowerCase();
    found.push({ keyword, repo: match[2] ?? match[3] ?? repo, number: Number(match[4]) });
    const more = new RegExp(TARGET, "gi");
    for (const extra of (match[5] ?? "").matchAll(more)) {
      found.push({ keyword, repo: extra[1] ?? extra[2] ?? repo, number: Number(extra[3]) });
    }
  }
  return found;
}

async function kindOf({ repo, number }, token) {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) return `unresolved (HTTP ${response.status})`;
  const body = await response.json();
  return body.pull_request ? "pull request" : "issue";
}

async function main() {
  const repo = process.env.REPO;
  const text = `${process.env.PR_TITLE ?? ""}\n${process.env.PR_BODY ?? ""}`;
  const refs = closingReferences(text, repo);
  const problems = [];
  for (const ref of refs) {
    const kind = await kindOf(ref, process.env.GH_TOKEN);
    const name = `${ref.repo === repo ? "" : ref.repo}#${ref.number}`;
    if (kind === "issue") console.log(`✓ "${ref.keyword} ${name}" closes an issue`);
    else problems.push(`"${ref.keyword} ${name}" names a ${kind}`);
  }
  if (problems.length === 0) {
    console.log(
      refs.length === 0 ? "✓ no closing keywords" : "✓ every closing keyword names an issue",
    );
    return;
  }
  const github = process.env.GITHUB_ACTIONS === "true";
  for (const problem of problems) {
    console.log(`${github ? "::error::" : "✗ "}${problem}. Merging this would close it.`);
  }
  console.log(
    'Closing keywords (fix, close, resolve and their forms) are for issues. Name a related pull request without one, e.g. "after #N" or "see #N".',
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
