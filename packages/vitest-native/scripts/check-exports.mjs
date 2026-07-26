// Packs the package and checks that every declared entry point resolves, using
// @arethetypeswrong/cli.
//
// This lived inline in two workflows, and they drifted: the resolution rule was
// re-enabled in ci.yml while release.yml — the path that actually publishes —
// kept running with it disabled. One script, called from both, is the only way
// that stays fixed.
//
// --profile node16 drops node10 (TypeScript's pre-`exports` resolution) from the
// matrix. Every subpath fails there by construction, since this package is
// exports-only and requires Node >= 20. That noise was previously silenced with
// `--ignore-rules no-resolution`, which disables the rule for EVERY resolution
// mode — so a subpath that genuinely stopped resolving under node16 or a bundler
// was reported green. Verified by packing a build whose ./presets pointed at a
// non-existent file: the old invocation exited 0 with every entry point green,
// while this one exits 1 on "node16 (from ESM): Resolution failed".
//
// --ignore-rules cjs-resolves-to-esm: the jest-compat runtime subpaths are
// intentionally ESM-only (they depend on vitest, which is ESM-only); CJS consumers
// use dynamic import. They are setup-file / Vite-alias targets, not typed imports.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-check-exports-"));

const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });

try {
  const packed = run("npm", ["pack", "--ignore-scripts", "--pack-destination", outDir]);
  if (packed.status !== 0) {
    console.error("✗ could not pack the package for the export check.");
    process.exit(1);
  }

  const [tarball] = fs.readdirSync(outDir).filter((f) => f.endsWith(".tgz"));
  if (!tarball) {
    console.error(`✗ npm pack produced no tarball in ${outDir}.`);
    process.exit(1);
  }

  const checked = run("npx", [
    "--yes",
    "@arethetypeswrong/cli",
    path.join(outDir, tarball),
    "--profile",
    "node16",
    "--ignore-rules",
    "cjs-resolves-to-esm",
  ]);
  process.exit(checked.status ?? 1);
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
