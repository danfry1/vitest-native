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
// (tsdown.config.ts and the static-types copy), and the manifest's consumer-facing
// fields decide how it installs and resolves: an `engines` change (#328), an
// `exports` edit or a new peer range reaches every user as surely as a source edit.
// The manifest is judged by field, so a devDependency bump or a new script does not
// need a changeset.
import { spawnSync } from "node:child_process";

const PACKAGE = "packages/vitest-native/";
const SHIPPED = `${PACKAGE}src/`;
const SHIPPED_BUILD_FILES = [
  `${PACKAGE}tsdown.config.ts`,
  `${PACKAGE}scripts/copy-static-types.mjs`,
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
];

/**
 * The shipped fields that differ between two package.json texts. Compared as JSON,
 * key order included: the order of `exports` conditions decides which target wins.
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
    (field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]),
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error("usage: node scripts/check-changeset.mjs <base-ref> [head-ref]");
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
        "      bunx changeset            # user-visible change\n" +
        "      bunx changeset --empty    # refactor or comments only — records the decision",
    );
    process.exit(1);
  }
}
