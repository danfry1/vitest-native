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
import { spawnSync } from "node:child_process";

const SHIPPED = "packages/vitest-native/src/";

/**
 * @param {string[]} changedFiles paths relative to the repository root
 * @returns {{ shipped: string[], hasChangeset: boolean, ok: boolean }}
 */
export function assessChangeset(changedFiles) {
  const shipped = changedFiles.filter((f) => f.startsWith(SHIPPED));
  const hasChangeset = changedFiles.some(
    (f) => f.startsWith(".changeset/") && f.endsWith(".md") && !f.endsWith("/README.md"),
  );
  return { shipped, hasChangeset, ok: shipped.length === 0 || hasChangeset };
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
  const { shipped, ok } = assessChangeset(changedFilesBetween(base, head));
  if (ok) {
    console.log(
      shipped.length === 0
        ? "✓ no shipped source changed — no changeset needed"
        : `✓ ${shipped.length} shipped file(s) changed, and a changeset is present`,
    );
  } else {
    console.error(
      `✗ ${shipped.length} file(s) under ${SHIPPED} changed with no changeset:\n` +
        shipped.map((f) => `    ${f}`).join("\n") +
        "\n\n  Releases are cut from the changeset queue, so this would ship to users with no\n" +
        "  changelog entry and no version bump.\n\n" +
        "      bunx changeset            # user-visible change\n" +
        "      bunx changeset --empty    # refactor or comments only — records the decision",
    );
    process.exit(1);
  }
}
