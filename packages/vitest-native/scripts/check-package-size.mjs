import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERBATIM_DIRS, isVerbatimRuntimeFile } from "./verbatim-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budget = JSON.parse(fs.readFileSync(path.join(root, "package-budget.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const npmCache = fs.mkdtempSync(path.join(os.tmpdir(), "vn-package-budget-npm-"));
const packed = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: npmCache },
});
fs.rmSync(npmCache, { recursive: true, force: true });
if (packed.status !== 0) {
  process.stderr.write(packed.stderr);
  console.error("Package budget check could not inspect the npm artifact.");
  process.exit(1);
}

let artifact;
try {
  [artifact] = JSON.parse(packed.stdout);
} catch {
  console.error(`Package budget check received invalid npm output:\n${packed.stdout}`);
  process.exit(1);
}

const requiredArtifactFields = ["size", "unpackedSize", "entryCount"];
if (
  !artifact ||
  requiredArtifactFields.some(
    (field) => !Number.isInteger(artifact[field]) || artifact[field] < 0,
  ) ||
  !Array.isArray(artifact.files)
) {
  console.error(`Package budget check received an unexpected npm report:\n${packed.stdout}`);
  process.exit(1);
}

/**
 * Must-ship files, derived from sources the build cannot edit.
 *
 * The numeric floors alone did not catch the defect they were written for: with all
 * of dist/native/ deleted (44 files, the whole native runtime) the artifact still had
 * 72 files and 360 KB packed, above floors that had drifted to ~45% under the
 * artifact. A count cannot say WHICH file is missing, so the expectation is a list:
 *
 * - every path `exports` and `bin` declare (what a consumer resolves);
 * - every runtime .mjs and hand-written .d.mts that the build copies verbatim
 *   (scripts/verbatim-runtime.mjs, shared with tsdown.config.ts), which Node loads by
 *   relative path at runtime, so no export map names most of them;
 * - every entry in `files`, which must exist: a listed file that is gone is a
 *   deleted page or licence, not an optional one;
 * - every file reachable by a relative import from those, transitively. Code-split
 *   chunks (dist/ecosystem-*.mjs and the like) have hashed names no source states,
 *   so the only way to require them is to follow the imports that load them.
 */
function declaredPaths(value, into) {
  if (typeof value === "string") into.add(path.posix.normalize(value.replace(/^\.\//, "")));
  else if (value && typeof value === "object") {
    for (const nested of Object.values(value)) declaredPaths(nested, into);
  }
  return into;
}

const shipped = new Set(artifact.files.map((file) => file.path));
const mustShip = new Set();
const problems = [];
declaredPaths(packageJson.exports, mustShip);
declaredPaths(packageJson.bin, mustShip);
for (const sub of VERBATIM_DIRS) {
  for (const file of fs.readdirSync(path.join(root, "src", sub))) {
    if (isVerbatimRuntimeFile(sub, file)) mustShip.add(path.posix.join("dist", sub, file));
  }
}
for (const entry of packageJson.files ?? []) {
  const stat = fs.statSync(path.join(root, entry), { throwIfNoEntry: false });
  if (!stat) problems.push(`${entry} (listed in package.json "files", does not exist)`);
  else if (stat.isFile()) mustShip.add(entry);
  else if (![...shipped].some((file) => file.startsWith(`${entry}/`))) {
    problems.push(`${entry}/ (listed in package.json "files", ships nothing)`);
  }
}

/**
 * `source` with its comments blanked out. The runtime's comments are full of example
 * imports (`require('./logo.png')`, `import config from './config'`) that are not
 * dependencies, so the specifier scan must not see them. Strings, template literals
 * and regular-expression literals are skipped over intact, so a `//` inside one is
 * not taken for a comment. A small scanner rather than a parser: the package has no
 * JavaScript parser of its own to depend on, and the build's output is plain ES.
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  let lastSignificant = "";
  const templateDepths = [];
  const regexMayStart = () =>
    lastSignificant === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant);
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`" || (ch === "}" && templateDepths.at(-1) === 0)) {
      // A string, a template literal, or the rest of a template after `${…}`.
      const quote = ch === "}" ? "`" : ch;
      if (ch === "}") templateDepths.pop();
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") j += 2;
        else if (source[j] === quote) break;
        else if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
          templateDepths.push(0);
          j += 1;
          break;
        } else j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
      lastSignificant = '"';
      continue;
    }
    if (ch === "/" && regexMayStart()) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== "\n") {
        if (source[j] === "\\") j += 2;
        else if (source[j] === "[" || source[j] === "]") {
          inClass = source[j] === "[";
          j++;
        } else if (source[j] === "/" && !inClass) break;
        else j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
      lastSignificant = "/";
      continue;
    }
    if (templateDepths.length > 0) {
      if (ch === "{") templateDepths[templateDepths.length - 1]++;
      else if (ch === "}") templateDepths[templateDepths.length - 1]--;
    }
    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i++;
  }
  return out;
}

// Relative specifiers in static imports and re-exports, dynamic import() and
// require(), as the bundler and the hand-written runtime emit them.
const RELATIVE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;
const CODE = /\.(?:mjs|cjs|js|d\.mts|d\.cts|d\.ts)$/;
const queue = [...mustShip].filter((file) => CODE.test(file) && shipped.has(file));
const reached = new Set(queue);
while (queue.length > 0) {
  const from = queue.pop();
  const source = stripComments(fs.readFileSync(path.join(root, from), "utf8"));
  const declaration = /\.d\.[cm]?ts$/.test(from);
  for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    // A declaration file names the JavaScript module; its types are the matching
    // declaration file beside it.
    if (declaration) target = target.replace(/\.(m|c)?js$/, (_, kind) => `.d.${kind ?? ""}ts`);
    if (reached.has(target)) continue;
    reached.add(target);
    mustShip.add(target);
    if (!shipped.has(target)) problems.push(`${target} (imported by ${from})`);
    else if (CODE.test(target)) queue.push(target);
  }
}

for (const file of mustShip) {
  if (!shipped.has(file) && !problems.some((p) => p.startsWith(`${file} (`))) problems.push(file);
}
problems.sort();
const present = [...mustShip].filter((file) => shipped.has(file)).length;
console.log(
  `Must-ship files: ${present} / ${mustShip.size} in the artifact (${reached.size} reached by import)`,
);
if (problems.length > 0) {
  console.error(
    `\nThe published artifact is missing ${problems.length} file(s) the package declares or loads at runtime:\n` +
      `${problems.map((file) => `  ${file}`).join("\n")}\n` +
      "Check that the build ran to completion (tsdown.config.ts build:done copies the runtime .mjs files).",
  );
}

const actual = {
  packedBytes: artifact.size,
  unpackedBytes: artifact.unpackedSize,
  files: artifact.entryCount,
  runtimeDependencies: Object.keys(packageJson.dependencies ?? {}).length,
  exportPaths: Object.keys(packageJson.exports ?? {}).length,
};
/**
 * Ceilings AND floors.
 *
 * Every limit here used to be an upper bound, so the check only ever noticed the
 * package growing. Measured against an unbuilt tree it reported "OK files: 8 / 85"
 * and exited 0 — a budget that passes while measuring nothing. A build that lost
 * the verbatim-copied native runtime reported "OK files: 60 / 85" just as happily,
 * though nothing using the native engine can start without it.
 *
 * `exportPaths` is checked exactly rather than bounded. Deleting a public entry
 * point is a breaking change for consumers, and it read as "OK exportPaths: 9 / 11"
 * — a shrinking published surface, reported by the check whose job is to track the
 * published surface. Adding one is a support commitment. Both should be a
 * deliberate edit to this file, not a silent pass.
 *
 * `runtimeDependencies` keeps a ceiling only: shipping fewer dependencies is never
 * the regression.
 *
 * Remaining headroom is printed for every bounded check, and a ceiling the artifact
 * is within `warnHeadroomRatio` of warns. Ceilings used to sit under 1% above the
 * artifact, so ordinary changes exhausted them silently and the first sign was a red
 * main — twice from changes that were each green on their own. Showing the headroom
 * makes the drift visible while it can still be handled deliberately.
 */
const checks = [
  { key: "packedBytes", min: budget.minPackedBytes, max: budget.maxPackedBytes },
  { key: "unpackedBytes", min: budget.minUnpackedBytes, max: budget.maxUnpackedBytes },
  { key: "files", min: budget.minFiles, max: budget.maxFiles },
  { key: "runtimeDependencies", max: budget.maxRuntimeDependencies },
  { key: "exportPaths", min: budget.exportPaths, max: budget.exportPaths },
];

// A ceiling the artifact is this close to is reported as nearly exhausted, but only
// for the bounded scale budgets. `exportPaths` is exact and `runtimeDependencies` is
// a policy cap where sitting at the limit is the intended state — warning that two of
// two dependencies are used would be noise on every run.
const warnRatio = typeof budget.warnHeadroomRatio === "number" ? budget.warnHeadroomRatio : 0;
const isScaleBudget = (min, max) => typeof min === "number" && min !== max;

let failed = problems.length > 0;
const under = [];
const tight = [];
console.log("Published package budget:");
for (const { key, min, max } of checks) {
  const value = actual[key];
  const tooBig = typeof max === "number" && value > max;
  const tooSmall = typeof min === "number" && value < min;
  failed ||= tooBig || tooSmall;
  if (tooSmall) under.push(key);
  const range = typeof min === "number" ? `${min}..${max}` : `<= ${max}`;
  let headroom = "";
  if (isScaleBudget(min, max) && !tooBig) {
    const ratio = (max - value) / max;
    if (ratio < warnRatio) tight.push(`${key}: ${max - value} left of ${max}`);
    headroom = `  (${(ratio * 100).toFixed(1)}% headroom)`;
  }
  console.log(`  ${tooBig || tooSmall ? "FAIL" : "OK  "} ${key}: ${value} / ${range}${headroom}`);
}

if (tight.length > 0) {
  // Not a failure: the artifact is still inside the budget. But a ceiling this
  // close is about to fail on unrelated work, and the useful moment to re-baseline
  // it — with a measurement and a justification — is now, not after main is red.
  console.warn(
    `\nCeilings nearly exhausted:\n${tight.map((t) => `  ${t}`).join("\n")}\n` +
      "Re-baseline package-budget.json deliberately, or find what grew.",
  );
}

if (failed) {
  // A shrink in the artifact and a shrink in the export map are different
  // problems: the first is nearly always an incomplete build, the second is a
  // breaking change. Reporting a build hint for a deleted entry point would send
  // the reader to look at dist/ for something that is not there.
  const messages = [];
  if (under.some((key) => key !== "exportPaths")) {
    messages.push(
      "The published artifact is SMALLER than expected. That is usually a build that did not run\n" +
        "or did not finish — check dist/ before touching the floor. If the reduction is real,\n" +
        "lower the floor in package-budget.json with a justification.",
    );
  }
  if (under.includes("exportPaths")) {
    messages.push(
      "Fewer export paths than declared: a public entry point was removed, which is a BREAKING\n" +
        "change for consumers. If that is intended, update `exportPaths` in package-budget.json\n" +
        "and make sure the removal is in a changeset as a major.",
    );
  }
  const overBudget = checks.some(({ key, max }) => typeof max === "number" && actual[key] > max);
  if (messages.length === 0 && overBudget) {
    messages.push(
      "Package budget exceeded. Reduce the published surface or update the budget with an explicit justification.",
    );
  }
  console.error(messages.join("\n\n"));
  process.exit(1);
}
