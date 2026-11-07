// node scripts/ci/vitest.mjs <vitest args…>
//
// Vitest, with the hang reporter (scripts/ci/hang-reporter.mjs) and the timeout-margin
// reporter (scripts/ci/timeout-margin-reporter.mjs) added when VN_HANG_GUARD=1, as the
// deadline wrapper sets it. Otherwise it runs Vitest unchanged. Package scripts
// call Vitest through this so every native and hot run is guarded on CI, with no config
// to edit and none to forget.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
if (process.env.VN_HANG_GUARD === "1") {
  const reporter = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));
  // A --reporter on the command line replaces the config's reporters, so keep the
  // default output unless the caller chose reporters of their own.
  if (!args.some((arg) => arg === "--reporter" || arg.startsWith("--reporter="))) {
    // Vitest's defaults, which a --reporter on the command line replaces: the terminal
    // output, and on GitHub Actions the inline annotations for failing tests.
    args.push("--reporter=default");
    if (process.env.GITHUB_ACTIONS === "true") args.push("--reporter=github-actions");
  }
  args.push(`--reporter=${reporter("hang-reporter.mjs")}`);
  args.push(`--reporter=${reporter("timeout-margin-reporter.mjs")}`);
}
const child = spawn(process.execPath, [...process.execArgv, cli, ...args], { stdio: "inherit" });
// Ctrl-C reaches Vitest directly (same process group); a second SIGINT from here would
// end it before its own cleanup. Only stay alive for it. A SIGTERM sent to this wrapper
// alone is passed on.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("close", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
