// Which lane owns a file, from agents/lanes.json (see AGENTS.md, "Lanes").
//
// A file listed in `shared` belongs to no lane. Otherwise the first lane with a
// matching glob owns it, so overlaps are settled by order, never by accident.
// tests/agent-lanes.test.ts checks that every tracked file has an owner.
//
// Usage:
//   node .github/scripts/lanes.mjs <file>...       print each file's lane
//   node .github/scripts/lanes.mjs --pr <number>   add the pull request's lane:* labels
//
// --pr reads the changed files and edits labels with the gh CLI, so it needs a gh
// login with write access. It only adds labels. A pull request that spans more than
// one lane gets every label and a warning, so a reviewer can ask whether it should
// have been split.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Lanes config as written in agents/lanes.json. */
export const LANES = JSON.parse(fs.readFileSync(path.join(repoRoot, "agents/lanes.json"), "utf8"));

/** A glob as an anchored regular expression: `**` crosses segments, `*` does not. */
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

const shared = LANES.shared.map(globToRegExp);
const lanes = LANES.lanes.map((lane) => ({ name: lane.name, globs: lane.globs.map(globToRegExp) }));

/** The lane that owns `file` (a repository-relative path), "shared", or undefined if none does. */
export function laneOf(file) {
  if (shared.some((re) => re.test(file))) return "shared";
  return lanes.find((lane) => lane.globs.some((re) => re.test(file)))?.name;
}

/** The distinct lanes a set of files touches, in config order, ignoring shared files. */
export function lanesOf(files) {
  const touched = new Set(files.map(laneOf));
  return LANES.lanes.map((lane) => lane.name).filter((name) => touched.has(name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--pr") {
    const pr = args[1];
    if (!pr || !/^\d+$/.test(pr)) {
      console.error("usage: lanes.mjs --pr <number>");
      process.exit(2);
    }
    const files = execFileSync("gh", ["pr", "diff", pr, "--name-only"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const unowned = files.filter((file) => laneOf(file) === undefined);
    if (unowned.length > 0) {
      console.error(`files with no lane (add them to agents/lanes.json):\n  ${unowned.join("\n  ")}`);
      process.exit(1);
    }
    const names = lanesOf(files);
    if (names.length === 0) {
      console.log(`#${pr} touches only shared files; no lane label added`);
    } else {
      const labelArgs = names.flatMap((name) => ["--add-label", `lane:${name}`]);
      execFileSync("gh", ["pr", "edit", pr, ...labelArgs], { stdio: "inherit" });
      if (names.length > 1) console.warn(`#${pr} spans ${names.length} lanes: ${names.join(", ")}`);
    }
  } else {
    if (args.length === 0) {
      console.error("usage: lanes.mjs <file>... | --pr <number>");
      process.exit(2);
    }
    for (const file of args) console.log(`${laneOf(file) ?? "(no lane)"}\t${file}`);
  }
}
