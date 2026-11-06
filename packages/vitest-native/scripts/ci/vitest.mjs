// node scripts/ci/vitest.mjs <vitest args…>
//
// Vitest, with the hang reporter (scripts/ci/hang-reporter.mjs) added when VN_HANG_GUARD=1,
// as the deadline wrapper sets it. Otherwise it runs Vitest unchanged. Package scripts
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
  const reporter = fileURLToPath(new URL("./hang-reporter.mjs", import.meta.url));
  // A --reporter on the command line replaces the config's reporters, so keep the
  // default output unless the caller chose reporters of their own.
  if (!args.some((arg) => arg === "--reporter" || arg.startsWith("--reporter="))) {
    args.push("--reporter=default");
  }
  args.push(`--reporter=${reporter}`);
}
const child = spawn(process.execPath, [...process.execArgv, cli, ...args], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("close", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
