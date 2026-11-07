// projectBabel (#579): project source that needs the project's Babel config compiles with
// it, and only that source (tests-native/vitest.project-babel.config.mts). Every case runs
// with Vitest's transform cache on: cold, then warm on the same cache.
//   main native|hot|mock  passes; routes Model.js (decorators), flow.js (Flow), answer.ts
//                         (a local plugin) and worklet.ts (worklets), and not plain.ts.
//   main never            Oxc only: the decorator file fails (the control).
//   main babel-plugin     Babel Vite plugins are in the config, one running the worklets
//                         plugin again on worklet.ts: the result is the same.
//   rn, expo, wrap        plain React Native and Expo configs, and an app preset wrapping
//                         React Native's: nothing routes.
//   wrapdec               an app preset wrapping React Native's and adding decorators and a
//                         JSX importSource: only the files with a decorator or JSX route,
//                         as ES modules (whatever React Native's preset does with classes).
//   cjs                   an unknown plugin writes CommonJS, and nothing else applies: Oxc
//                         instead, warned once.
//   cjslabel              the same beside another unknown plugin the file needs: fails.
//   expoesm               babel-preset-expo with its native module transform on and a
//                         dynamic-import plugin listed: a routed file with import() passes.
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
// Every file routed, test files included, with "/" on every platform.
const routed = (output) =>
  [...output.matchAll(/projectBabel: (\S+) \(/g)].map((m) => m[1].replaceAll("\\", "/")).sort();

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

const MAIN_ROUTED = ["src/Model.js", "src/answer.ts", "src/flow.js", "src/worklet.ts"]
  .sort()
  .join(",");
for (const mode of ["native", "hot", "mock", "babel-plugin"]) {
  const cold = run("main", mode, `main-${mode}`);
  check(
    `main ${mode} cold: 5 pass, routes ${MAIN_ROUTED} only`,
    cold.status === 0 &&
      /Tests\s+5 passed \(5\)/.test(cold.output) &&
      routed(cold.output).join(",") === MAIN_ROUTED,
    cold.output,
  );
  const warm = run("main", mode, `main-${mode}`);
  check(
    `main ${mode} warm: 5 pass`,
    warm.status === 0 && /Tests\s+5 passed \(5\)/.test(warm.output),
    warm.output,
  );
}
const never = run("main", "never", "main-never");
check(
  "main never: the decorator file fails",
  never.status === 1 && /SyntaxError/.test(never.output),
  never.output,
);
for (const fixture of ["rn", "expo", "wrap"]) {
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

// An app preset wrapping React Native's adds decorators: only the decorator file routes,
// and React Native's own module transform inside it does not make it CommonJS.
for (const pass of ["cold", "warm"]) {
  const result = run("wrapdec", "native", "wrapdec");
  check(
    `wrapdec ${pass}: passes${pass === "cold" ? ", routes card.test.tsx, src/Card.tsx and src/Model.js only" : ""}`,
    result.status === 0 &&
      /Tests\s+2 passed \(2\)/.test(result.output) &&
      (pass === "warm" ||
        routed(result.output).join(",") ===
          ["card.test.tsx", "src/Card.tsx", "src/Model.js"].sort().join(",")),
    result.output,
  );
}

// Bluesky's shape: babel-preset-expo with its native module transform on and a
// dynamic-import plugin listed. A routed file with import() still compiles as ESM.
for (const pass of ["cold", "warm"]) {
  const result = run("expoesm", "native", "expoesm");
  check(
    `expoesm ${pass}: a routed file under babel-preset-expo with import() passes`,
    result.status === 0 &&
      /Tests\s+1 passed \(1\)/.test(result.output) &&
      !/depends on a modules transform plugin/.test(result.output),
    result.output,
  );
}

// A plugin vitest-native does not know writes CommonJS: Oxc compiles those files instead,
// and the run says so once, naming the preset.
const cjs = run("cjs", "native", "cjs");
check(
  "cjs: an unknown plugin's CommonJS falls back to Oxc, warned once",
  cjs.status === 0 &&
    /Tests\s+1 passed \(1\)/.test(cjs.output) &&
    (
      cjs.output.match(
        /the preset \.\/cjs-preset\.cjs \(adds custom-commonjs\) writes CommonJS/g,
      ) ?? []
    ).length === 1,
  cjs.output,
);

// A CommonJS writer beside another unknown plugin the file needs: falling back to Oxc
// would drop the other one, so the run fails by name.
const cjslabel = run("cjslabel", "native", "cjslabel");
check(
  "cjslabel: a CommonJS writer beside a plugin the file needs fails by name",
  cjslabel.status === 1 &&
    /PROJECT_BABEL_COMMONJS|writes CommonJS some other way/.test(cjslabel.output) &&
    /cannot fall back to Oxc/.test(cjslabel.output),
  cjslabel.output,
);

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
