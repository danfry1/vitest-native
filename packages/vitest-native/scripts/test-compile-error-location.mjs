// A module that does not compile fails its file naming the file, line and column, under
// both engines and the hot runtime (native/compile-error.mjs). Node gives the location
// only as a header on the SyntaxError's stack; Vitest's report printed the message
// alone, "Invalid or unexpected token", with no file.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const config = path.join("tests-native", "vitest.compile-error.config.mts");

let failed = false;
for (const mode of ["native", "hot", "mock"]) {
  const result = spawnSync(process.execPath, [vitestEntry, "run", "--config", config, "--mode", mode], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const located = /SyntaxError: Invalid or unexpected token \(.*[\\/]compile-error[\\/]Subscription\.js:12:3\)/.test(output);
  const framed = /12 \|\s+@field\("name"\) name;\n\s+\^/.test(output);
  const ok = result.status === 1 && located && framed;
  console.log(`${ok ? "✓" : "✗"} ${mode}: exit ${result.status}, location ${located}, frame ${framed}`);
  if (!ok) {
    failed = true;
    console.log(output.split("\n").filter((l) => /FAIL|Error|\|/.test(l)).slice(0, 12).join("\n"));
  }
}
if (failed) process.exit(1);
console.log("A module that does not compile fails naming its file, line and column.");
