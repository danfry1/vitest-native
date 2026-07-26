// The cross-check runs against the BUILT plugin: crosscheck/vitest.config.mts
// imports ../dist/index.mjs. dist/ is gitignored and no install hook produces
// it, so on a fresh clone the published instruction — "clone the repo and run
// `bun run crosscheck`" — died on an unresolved import before a single probe
// ran. That instruction is the reproducibility claim the fidelity page rests on,
// so the command builds what it needs rather than assuming a prior step.
//
// Dependencies are injected so the decision can be tested without running a
// build or touching dist/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Ensure the built plugin entry exists, building once if it does not.
 *
 * @returns {{ built: boolean }} whether a build was run
 * @throws if the entry is still absent afterwards
 */
export function ensureBuilt({
  root,
  exists = fs.existsSync,
  run = (command, args, options) => spawnSync(command, args, options),
  log = console.log,
} = {}) {
  const entry = path.join(root, "dist", "index.mjs");
  if (exists(entry)) return { built: false };

  log("── dist/ not found — building the plugin the cross-check runs against ──");
  const result = run("bun", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    // Windows resolves bun.exe/bun.cmd through the shell.
    shell: process.platform === "win32",
  });

  if (result.status !== 0 || !exists(entry)) {
    throw new Error(
      "Could not build the plugin the cross-check needs.\n" +
        "  Run `bun install && bun run build` in packages/vitest-native, then retry.",
    );
  }
  return { built: true };
}
