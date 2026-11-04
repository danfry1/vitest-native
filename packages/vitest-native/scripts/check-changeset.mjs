// Fails a pull request that changes shipped source without recording a changeset.
//
// Releases are cut from the changeset queue, so a change to src/ with no entry
// ships to users with no changelog line and contributes nothing to the version
// bump. Nothing checked this: of thirteen pull requests opened in a single
// session, the two that touched src/ — a new warning users would see, and a
// change to what `doctor` reports — both had no changeset, and every gate was
// green.
//
// Comment-only edits and internal refactors genuinely need no release note. They
// need an explicit `bunx changeset --empty`, which records the decision rather
// than leaving it to be inferred from an absence.
//
// Shipped means more than src/. The build files decide what dist/ contains
// (tsdown.config.ts, the verbatim runtime list it copies from and the static-types
// copy), and the manifest's consumer-facing
// fields decide how it installs and resolves: an `engines` change (#328), an
// `exports` edit or a new peer range reaches every user as surely as a source edit.
// The manifest is judged by field, so a devDependency bump or a new script does not
// need a changeset. A production `dependencies` change does, Dependabot's included:
// it changes what every user installs, so it gets a patch changeset naming the bump.
//
// A changeset that is present still has to read as a release note. Each one becomes a
// CHANGELOG entry that users skim to decide whether an upgrade affects them, and that
// agents read for exact names. `lintChangeset` holds each vitest-native entry to the
// style in CONTRIBUTING.md ("Writing a changeset"): a short bold lead, a short body,
// an action line, no release-candidate references and no internal vocabulary.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PACKAGE = "packages/vitest-native/";
const SHIPPED = `${PACKAGE}src/`;
const SHIPPED_BUILD_FILES = [
  `${PACKAGE}tsdown.config.ts`,
  `${PACKAGE}scripts/copy-static-types.mjs`,
  `${PACKAGE}scripts/verbatim-runtime.mjs`,
];
export const MANIFEST = `${PACKAGE}package.json`;

/** package.json fields that reach consumers: how the package installs, resolves and runs. */
export const SHIPPED_MANIFEST_FIELDS = [
  "name",
  "type",
  "main",
  "module",
  "types",
  "exports",
  "imports",
  "bin",
  "files",
  "sideEffects",
  "engines",
  "os",
  "cpu",
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "publishConfig",
  "typesVersions",
];

// Fields whose meaning is a set or a map: reordering them changes nothing a consumer
// installs, so they compare in canonical order. Everything else compares as written;
// `exports` above all, where condition order decides which target wins.
const UNORDERED_SETS = new Set(["files", "os", "cpu", "bundleDependencies"]);
const UNORDERED_MAPS = new Set([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "engines",
]);

function canonical(field, value) {
  if (UNORDERED_SETS.has(field) && Array.isArray(value)) return [...value].sort();
  if (UNORDERED_MAPS.has(field) && value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return value;
}

/**
 * The shipped fields that differ between two package.json texts. Compared as JSON
 * after `canonical()`, so a reordered `files` list or dependency map is no change,
 * while the order of `exports` conditions, which decides the target, still is.
 *
 * @param {string | null} before manifest text at the base, or null if absent
 * @param {string | null} after manifest text at the head, or null if absent
 * @returns {string[]}
 */
export function shippedManifestChanges(before, after) {
  const parse = (text) => (text == null ? {} : JSON.parse(text));
  const a = parse(before);
  const b = parse(after);
  return SHIPPED_MANIFEST_FIELDS.filter(
    (field) =>
      JSON.stringify(canonical(field, a[field])) !== JSON.stringify(canonical(field, b[field])),
  );
}

/**
 * @param {string[]} changedFiles paths relative to the repository root
 * @param {string[]} [manifestFields] shipped package.json fields that changed
 * @returns {{ shipped: string[], hasChangeset: boolean, ok: boolean }}
 */
export function assessChangeset(changedFiles, manifestFields = []) {
  const shipped = [
    ...changedFiles.filter((f) => f.startsWith(SHIPPED) || SHIPPED_BUILD_FILES.includes(f)),
    ...manifestFields.map((field) => `${MANIFEST}#${field}`),
  ];
  const hasChangeset = changedFiles.some(
    (f) => f.startsWith(".changeset/") && f.endsWith(".md") && !f.endsWith("/README.md"),
  );
  return { shipped, hasChangeset, ok: shipped.length === 0 || hasChangeset };
}

/** Soft limits: set above the targets in CONTRIBUTING.md (~25 and ~80 words). */
export const LEAD_WORD_LIMIT = 30;
export const BODY_WORD_LIMIT = 110;

/**
 * Words only the maintainers use, with what to say instead. Matched outside code
 * spans, so an error message or identifier quoted in backticks never trips them.
 */
export const BANNED_TERMS = [
  {
    pattern: /\b(node|vite)-owned\b/i,
    term: "Node-owned / Vite-owned",
    instead:
      "loaded by Node (a `vi.mock` from a test does not reach its imports) / compiled by Vite",
  },
  {
    pattern: /\bown(er|ers|ership)\b/i,
    term: "owner / ownership",
    instead: "whether Vite or Node loads the file",
  },
  {
    pattern: /\bclosure\b/i,
    term: "closure / closure walk",
    instead: "the packages vitest-native compiles",
  },
  {
    pattern: /(?<!\bnpm )\bregistry\b/i,
    term: "registry",
    instead:
      'React Native\'s precompiled modules, or just the effect ("React Native loads faster")',
  },
];

const ACTION_VERBS = [
  "Add",
  "Change",
  "Declare",
  "Delete",
  "Disable",
  "Drop",
  "Enable",
  "Install",
  "Keep",
  "List",
  "Move",
  "Pass",
  "Pin",
  "Remove",
  "Rename",
  "Replace",
  "Run",
  "Set",
  "Switch",
  "Update",
  "Upgrade",
  "Use",
];
// "No action needed.", or a sentence that starts with an imperative ("Set `hot: false`
// to opt out.") or with "To …," ("To opt out, set …"). Case-sensitive: a verb counts
// only where a sentence or a bullet starts.
const SENTENCE_START = String.raw`(?:^\s*(?:[-*]\s+)?|[.:!](?:\*\*)?\s+)`;
const ACTION_PATTERN = new RegExp(
  [
    String.raw`\bNo action (?:is )?needed\b`,
    `${SENTENCE_START}(?:${ACTION_VERBS.join("|")})\\b`,
    String.raw`${SENTENCE_START}To [^,.\n]+,\s*[a-z]+`,
  ].join("|"),
  "m",
);

const RC_REFERENCE = /\brc\.\d+/i;

/** Words, counting each `code span` as one so quoting an exact error costs nothing extra. */
function countWords(text) {
  return text
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/`[^`]*`/g, " code ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Splits a changeset into the packages it bumps and its Markdown body.
 *
 * @param {string} text
 * @returns {{ packages: string[], body: string }}
 */
export function parseChangeset(text) {
  const match = /^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)([\s\S]*)$/m.exec(text);
  if (!match || match.index !== 0) return { packages: [], body: text.trim() };
  const packages = match[1]
    .split(/\r?\n/)
    .map((line) => /^\s*["']?([^"':]+)["']?\s*:/.exec(line)?.[1]?.trim())
    .filter(Boolean);
  return { packages, body: match[2].trim() };
}

/**
 * The style problems in one changeset, as messages naming the rule and its limit.
 * Empty changesets (`bunx changeset --empty`) and changesets that do not bump
 * vitest-native have none.
 *
 * @param {string} text the changeset file's contents
 * @returns {string[]}
 */
export function lintChangeset(text) {
  const { packages, body } = parseChangeset(text);
  if (!packages.includes("vitest-native")) return [];

  const problems = [];
  const lead = /^\*\*([\s\S]+?)\*\*/.exec(body);
  if (!lead) {
    problems.push(
      "no bold lead: start with **the user-visible effect and who it affects** in one sentence",
    );
  } else {
    const leadWords = countWords(lead[1]);
    if (leadWords > LEAD_WORD_LIMIT) {
      problems.push(
        `the bold lead is ${leadWords} words; the limit is ${LEAD_WORD_LIMIT} (aim for ~25)`,
      );
    }
  }

  const bodyWords = countWords(body);
  if (bodyWords > BODY_WORD_LIMIT) {
    problems.push(
      `the entry is ${bodyWords} words; the limit is ${BODY_WORD_LIMIT} (aim for ~80). ` +
        "Keep at most three detail bullets and move longer explanations to the docs, with a link",
    );
  }

  if (!ACTION_PATTERN.test(body)) {
    problems.push(
      'no action line: say "No action needed." or the exact change, starting with a verb ' +
        `(${ACTION_VERBS.slice(0, 6).join(", ")}, …) or "To opt out, …"`,
    );
  }

  const rc = RC_REFERENCE.exec(body);
  if (rc) {
    problems.push(
      `"${rc[0]}" refers to a release candidate: write against the last stable release. ` +
        "A fix to something only a release candidate broke says so in one short clause, without the version, or is folded in",
    );
  }

  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  for (const { pattern, term, instead } of BANNED_TERMS) {
    const hit = pattern.exec(prose);
    if (hit) problems.push(`internal term "${hit[0]}" (${term}): say ${instead}`);
  }
  return problems;
}

function fileAt(ref, file) {
  const res = spawnSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" });
  return res.status === 0 ? res.stdout : null;
}

function changedFilesBetween(base, head) {
  const res = spawnSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`✗ could not diff ${base}...${head}:\n${res.stderr}`);
    process.exit(1);
  }
  return res.stdout.split("\n").filter(Boolean);
}

// Run as a script, not when imported by tests. Compared as real paths: matching on the
// last `/`-separated segment of argv[1] never matched on Windows, where argv[1] uses
// backslashes, so the check was skipped and every run there exited 0.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

/** Changeset files among the changed paths: `.changeset/*.md`, the README aside. */
export function changesetFiles(changedFiles) {
  return changedFiles.filter(
    (f) => /^\.changeset\/[^/]+\.md$/.test(f) && !f.endsWith("/README.md"),
  );
}

/** Prints each changeset's style problems; returns whether there were none. */
function reportStyle(changesets) {
  let clean = true;
  for (const { file, text } of changesets) {
    const problems = lintChangeset(text);
    if (problems.length === 0) continue;
    clean = false;
    console.error(`✗ ${file} does not follow the changeset style:`);
    for (const problem of problems) console.error(`    - ${problem}`);
  }
  if (!clean) {
    console.error(
      '\n  See "Writing a changeset" in CONTRIBUTING.md. The entry becomes the release notes.',
    );
  } else if (changesets.length > 0) {
    console.log(`✓ ${changesets.length} changeset(s) follow the changeset style`);
  }
  return clean;
}

if (isMain()) {
  const args = process.argv.slice(2);
  // `--lint <file>...` checks the style of changesets on disk, without git.
  if (args[0] === "--lint") {
    // A README has no frontmatter, so a `.changeset/*.md` glob passes it harmlessly.
    const files = args.slice(1);
    const ok = reportStyle(files.map((file) => ({ file, text: fs.readFileSync(file, "utf8") })));
    process.exit(ok ? 0 : 1);
  }
  const [base, head = "HEAD"] = args;
  if (!base) {
    console.error(
      "usage: node scripts/check-changeset.mjs <base-ref> [head-ref]\n" +
        "       node scripts/check-changeset.mjs --lint <changeset.md>...",
    );
    process.exit(1);
  }
  const changed = changedFilesBetween(base, head);
  // Three-dot diff above, so the manifest is compared from the merge base as well.
  const mergeBase = spawnSync("git", ["merge-base", base, head], { encoding: "utf8" });
  if (mergeBase.status !== 0) {
    console.error(`✗ could not find the merge base of ${base} and ${head}:\n${mergeBase.stderr}`);
    process.exit(1);
  }
  const manifestFields = changed.includes(MANIFEST)
    ? shippedManifestChanges(fileAt(mergeBase.stdout.trim(), MANIFEST), fileAt(head, MANIFEST))
    : [];
  // Changesets the branch adds or edits. A deleted one (a release consumes them all)
  // has no text at the head and nothing to check.
  const styled = changesetFiles(changed)
    .map((file) => ({ file, text: fileAt(head, file) }))
    .filter(({ text }) => text != null);
  const styleOk = reportStyle(styled);
  const { shipped, ok } = assessChangeset(changed, manifestFields);
  if (ok) {
    console.log(
      shipped.length === 0
        ? "✓ no shipped source, build file or package.json field changed — no changeset needed"
        : `✓ ${shipped.length} shipped file(s) changed, and a changeset is present`,
    );
  } else {
    console.error(
      `✗ ${shipped.length} shipped file(s) or package.json field(s) changed with no changeset:\n` +
        shipped.map((f) => `    ${f}`).join("\n") +
        "\n\n  Releases are cut from the changeset queue, so this would ship to users with no\n" +
        "  changelog entry and no version bump.\n\n" +
        "  A production dependency change ships to users too, a Dependabot bump included: add a\n" +
        '  patch changeset naming the bump (e.g. "Updates magic-string to 1.4.4.").\n\n' +
        "      bunx changeset            # user-visible change\n" +
        "      bunx changeset --empty    # refactor or comments only — records the decision",
    );
    process.exit(1);
  }
  if (!styleOk) process.exit(1);
}
