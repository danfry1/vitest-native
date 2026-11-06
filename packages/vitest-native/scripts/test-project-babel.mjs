// projectBabel (#579): project source that needs the project's Babel config compiles with
// it, and only that source (tests-native/vitest.project-babel.config.mts). Every case runs
// with Vitest's transform cache on: cold, then warm on the same cache.
//   main native|hot|mock  passes; routes Model.js (decorators), flow.js (Flow) and
//                         answer.ts (a local plugin), and not plain.ts.
//   main never            Oxc only: the decorator file fails (the control).
//   main babel-plugin     a Babel Vite plugin is in the config: the engine still compiles
//                         what needs the project's config.
//   rn, expo              plain React Native and Expo configs: nothing routes.
//   cache                 after a warm run, the local plugin changes: the next warm run
//                         recompiles the file it applies to.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const config = path.join("tests-native", "vitest.project-babel.config.mts");
const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-project-babel-"));

function run(fixture, mode, cache) {
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--config", config, "--mode", mode],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        VN_PROJECT_BABEL_FIXTURE: fixture,
        VN_PROJECT_BABEL_CACHE: path.join(cacheRoot, cache),
      },
    },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}
const routed = (output) =>
  [...output.matchAll(/projectBabel: (src\/\S+) \(/g)].map((m) => m[1]).sort();

let failed = false;
function check(label, ok, output) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    failed = true;
    console.log(
      output
        .split("\n")
        .filter((l) => /projectBabel|Error|Tests |×/.test(l))
        .slice(0, 12)
        .join("\n"),
    );
  }
}

const MAIN_ROUTED = ["src/Model.js", "src/answer.ts", "src/flow.js"].join(",");
for (const mode of ["native", "hot", "mock", "babel-plugin"]) {
  const cold = run("main", mode, `main-${mode}`);
  check(
    `main ${mode} cold: 4 pass, routes ${MAIN_ROUTED} only`,
    cold.status === 0 &&
      /Tests\s+4 passed \(4\)/.test(cold.output) &&
      routed(cold.output).join(",") === MAIN_ROUTED,
    cold.output,
  );
  const warm = run("main", mode, `main-${mode}`);
  check(
    `main ${mode} warm: 4 pass`,
    warm.status === 0 && /Tests\s+4 passed \(4\)/.test(warm.output),
    warm.output,
  );
}
const never = run("main", "never", "main-never");
check(
  "main never: the decorator file fails",
  never.status === 1 && /SyntaxError/.test(never.output),
  never.output,
);
for (const fixture of ["rn", "expo"]) {
  for (const pass of ["cold", "warm"]) {
    const result = run(fixture, "native", fixture);
    check(
      `${fixture} ${pass}: passes, nothing routed`,
      result.status === 0 &&
        /Tests\s+1 passed \(1\)/.test(result.output) &&
        routed(result.output).length === 0,
      result.output,
    );
  }
}

// Cache: the local plugin is a file the config requires, not a package.
const plugin = path.join(packageRoot, "tests-native", "project-babel", "plugins", "answer.cjs");
const original = fs.readFileSync(plugin, "utf8");
try {
  fs.writeFileSync(plugin, original.replace("numericLiteral(42)", "numericLiteral(43)"));
  const changed = run("main", "native", "main-native");
  check(
    "cache: a changed local plugin recompiles the file it applies to",
    changed.status === 1 && /expected 43 to be 42/.test(changed.output),
    changed.output,
  );
} finally {
  fs.writeFileSync(plugin, original);
}

fs.rmSync(cacheRoot, { recursive: true, force: true });
if (failed) process.exit(1);
console.log(
  "Project source that needs the project's Babel config compiles with it, and only that source.",
);
