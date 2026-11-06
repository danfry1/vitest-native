// projectBabel (#579): project source that needs the project's Babel config compiles with
// it, under both engines and the hot runtime (tests-native/vitest.project-babel.config.mts).
//   native, hot, mock  legacy decorators, a project plugin and Flow compile; the startup
//                      lines name what triggered it.
//   never              Oxc only: the decorator file fails to compile (the control).
//   deferred           a Babel Vite plugin is in the config: projectBabel steps aside,
//                      names it, and the decorator file fails as with `never`.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const config = path.join("tests-native", "vitest.project-babel.config.mts");

const cases = {
  native: { pass: true },
  hot: { pass: true },
  mock: { pass: true },
  never: { pass: false },
  deferred: {
    pass: false,
    line: /the fake-babel-for-test plugin compiles project source with Babel/,
  },
};
const TRIGGERS = [
  /for @babel\/plugin-proposal-decorators, .*\.\/plugins\/answer\.cjs\./,
  /for Flow syntax\./,
];

let failed = false;
for (const [mode, expected] of Object.entries(cases)) {
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--config", config, "--mode", mode],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    },
  );
  const output = `${result.stdout}\n${result.stderr}`;
  const checks = expected.pass
    ? [
        result.status === 0 && /Tests\s+3 passed \(3\)/.test(output),
        ...TRIGGERS.map((re) => re.test(output)),
      ]
    : [
        result.status === 1 && /SyntaxError/.test(output),
        !expected.line || expected.line.test(output),
      ];
  const ok = checks.every(Boolean);
  console.log(
    `${ok ? "✓" : "✗"} ${mode}: exit ${result.status}, checks ${checks.map(Number).join("")}`,
  );
  if (!ok) {
    failed = true;
    console.log(
      output
        .split("\n")
        .filter((l) => /projectBabel|Error|Tests |×/.test(l))
        .slice(0, 10)
        .join("\n"),
    );
  }
}
if (failed) process.exit(1);
console.log("Project source that needs the project's Babel config compiles with it.");
