// Under the hot runtime, ESM generation must not add entries to Node's V8 compile
// cache.
//
// Hot ESM generation re-evaluates each externalized ES module a test file imports
// under a new URL (`?vnhot=N`), and Node keys compile-cache entries by URL. With the
// cache on, every file added entries for the modules it re-evaluated, all written when
// the worker exits, inside Vitest's teardownTimeout. This gate runs a project whose
// test files import an ES package of many modules, on one worker, from a cold cache.
// With ESM generation on, the worker must write no entries at all. With it off (by
// config and by the environment escape hatch) and under per-file isolation, the cache
// must still fill, so the gate cannot pass by turning the cache off everywhere.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const pluginUrl = pathToFileURL(path.join(packageRoot, "dist", "index.mjs")).href;
const MODULES = 30;
const FILES = 6;

// Inside the package, so React Native resolves from the repository's install; the
// fixture's own node_modules makes it the cache root (transform.mjs cacheRootFor).
const fixture = fs.mkdtempSync(path.join(packageRoot, ".compile-cache-fixture-"));

function write(rel, text) {
  const file = path.join(fixture, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function setUp() {
  const pkg = "node_modules/vn-compile-cache-probe";
  write(
    `${pkg}/package.json`,
    JSON.stringify({ name: "vn-compile-cache-probe", type: "module", exports: "./index.js" }),
  );
  const names = Array.from({ length: MODULES }, (_, i) => `m${i}`);
  // Each module carries real functions: V8 keeps no cache entry for a trivial script.
  const body = (i) =>
    Array.from(
      { length: 30 },
      (_, k) =>
        `export function f${k}(x) { let s = ${i}; for (let n = 0; n < x; n++) s += n % ${k + 2}; return s; }`,
    ).join("\n");
  for (const [i, name] of names.entries())
    write(`${pkg}/${name}.js`, `${body(i)}\nexport const ${name} = ${i};\n`);
  write(
    `${pkg}/index.js`,
    names.map((name) => `import { ${name} } from "./${name}.js";`).join("\n") +
      `\nexport const total = ${names.join(" + ")};\n`,
  );
  write(
    "vitest.config.mjs",
    `import { defineConfig } from "vitest/config";
import { reactNative } from ${JSON.stringify(pluginUrl)};
const hotRuntime = JSON.parse(process.env.VN_CC_HOT);
export default defineConfig({
  root: ${JSON.stringify(fixture)},
  plugins: [reactNative({ engine: "native", hotRuntime })],
  test: {
    environment: "node",
    include: ["tests/*.test.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    // Long enough for a worker to write the whole cache at exit, so a count is not cut short.
    teardownTimeout: 120000,
  },
});
`,
  );
}

function setFiles(count) {
  fs.rmSync(path.join(fixture, "tests"), { recursive: true, force: true });
  const total = (MODULES * (MODULES - 1)) / 2;
  for (let i = 0; i < count; i++) {
    write(
      `tests/f${String(i).padStart(2, "0")}.test.ts`,
      `import { expect, test } from "vitest";\nimport { total } from "vn-compile-cache-probe";\ntest("imports the probe", () => expect(total).toBe(${total}));\n`,
    );
  }
}

const cacheDir = () => path.join(fixture, "node_modules", ".cache", "vitest-native", "v8");

function countEntries(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countEntries(path.join(dir, entry.name)) : 1;
  }
  return n;
}

// The gate counts only the entries vitest-native's own decision writes. A developer's
// NODE_COMPILE_CACHE turns Node's cache on in every worker before our code runs (and
// NODE_DISABLE_COMPILE_CACHE turns it off), so neither is passed to the runs.
const inheritedEnv = { ...process.env };
delete inheritedEnv.NODE_COMPILE_CACHE;
delete inheritedEnv.NODE_DISABLE_COMPILE_CACHE;

function run(label, files, hotRuntime, extraEnv = {}) {
  setFiles(files);
  // Clear the transform cache too, so every run is equally cold: Babel then loads in
  // each run, and its modules land in the compile cache every time.
  fs.rmSync(path.dirname(cacheDir()), { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--config", path.join(fixture, "vitest.config.mjs")],
    {
      cwd: fixture,
      encoding: "utf8",
      env: {
        ...inheritedEnv,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        VN_CC_HOT: JSON.stringify(hotRuntime),
        ...extraEnv,
      },
    },
  );
  if (result.error) throw result.error;
  const output = stripVTControlCharacters(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (result.status !== 0 || !new RegExp(`Test Files\\s+${files} passed`).test(output)) {
    throw new Error(`${label}: the run did not pass all ${files} files:\n${output}`);
  }
  const entries = countEntries(cacheDir());
  const timeouts = (output.match(/Timeout terminating/g) ?? []).length;
  console.log(
    `  ${label}: ${files} files, ${entries} compile-cache entries${timeouts ? `, ${timeouts} teardown timeouts` : ""}`,
  );
  return entries;
}

let failed = false;
const check = (ok, message) => {
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
};

try {
  setUp();
  console.log("hot compile cache:");
  const hot = { allowUnboundedMemory: true };
  // ESM generation off through the config option, the documented opt-out: every module
  // has one URL, and the cache stays on.
  const noGen = run("hot, esmGeneration: false", FILES, { ...hot, esmGeneration: false });
  check(
    noGen > 0,
    `the hot runtime with esmGeneration: false still fills the cache (${noGen} entries)`,
  );
  // The same through the environment escape hatch.
  const noGenEnv = run("hot, VITEST_NATIVE_HOT_ESM_GEN=0", FILES, hot, {
    VITEST_NATIVE_HOT_ESM_GEN: "0",
  });
  check(
    noGenEnv > 0,
    `the hot runtime with VITEST_NATIVE_HOT_ESM_GEN=0 still fills the cache (${noGenEnv} entries)`,
  );
  // With ESM generation on, the cache stays off in the worker, so a run writes nothing:
  // any entry means some copy of the decision turned it back on.
  const withGen = run("hot with ESM generation", FILES, hot);
  check(
    withGen === 0,
    `ESM generation leaves the compile cache off (${withGen} entries, expected 0)`,
  );
  const stock = run("per-file isolation", FILES, false);
  check(stock > 0, `per-file isolation still fills the cache (${stock} entries)`);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

if (failed) process.exit(1);
