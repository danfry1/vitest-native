// node scripts/build-stamp.mjs write
//
// The native and hot gates run the BUILT plugin: tests-native configs import
// ../dist/index.mjs, and dist/ is only as new as the last `bun run build`. After a merge,
// a checkout or an edit to src/, a gate silently tests the old build: a fix that is in
// the source fails its own gate, or a bug that is in the source passes. The build ends by
// writing a stamp, a hash of everything it read (build-inputs.mjs), and the configs check
// it before they load dist/ (tests-native/support/fresh-dist.mts).
//
// The hash is of contents, not times: a checkout that rewrites a file with the same
// contents leaves the build current, and an edit that keeps an old time does not.
//
// The stamp lives outside dist/, so it never ships in the package.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_FILES, SOURCE_DIR } from "./build-inputs.mjs";

export const STAMP = "node_modules/.cache/vitest-native/build-stamp.json";

/** A hash of every build input under `root`: paths and contents, in a stable order. */
export function buildInputsHash(root) {
  const files = [...listFiles(root, SOURCE_DIR), ...BUILD_FILES].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Records that dist/ under `root` was built from the inputs as they are now. */
export function writeBuildStamp(root) {
  const stamp = path.join(root, STAMP);
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, `${JSON.stringify({ inputs: buildInputsHash(root) })}\n`);
}

/**
 * Why dist/ under `root` was not built from the build inputs as they are now, or null
 * when it was.
 */
export function distStaleness(root) {
  let recorded;
  try {
    recorded = JSON.parse(fs.readFileSync(path.join(root, STAMP), "utf8")).inputs;
  } catch {
    return "there is no record of a build (the stamp `bun run build` writes is missing)";
  }
  return recorded === buildInputsHash(root)
    ? null
    : "src/ or the build files changed since the last `bun run build`";
}

/** Throws, naming the fix, when dist/ under `root` is stale (distStaleness). */
export function assertFreshDist(root) {
  const why = distStaleness(root);
  if (why === null) return;
  throw new Error(
    `[vitest-native] dist/ is stale: ${why}. These tests run the built plugin, so they ` +
      `would test the old build. Run \`bun run build\` in packages/vitest-native, then retry.`,
  );
}

function listFiles(root, dir) {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  if (command !== "write") {
    console.error("usage: node scripts/build-stamp.mjs write");
    process.exit(2);
  }
  writeBuildStamp(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}
