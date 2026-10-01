// Packed gate: Vitest behaves as Vitest users know it under vitest-native's defaults.
//
// One packed install, many runs. Each scenario sets Vitest config and/or CLI flags the
// way a user would and asserts three things:
//   - which runtime ran (the tests record it), so an explicit Vitest setting is never
//     silently overridden by hotRuntime:'auto';
//   - Vitest's own outcome for the scenario (counts from the JSON reporter, exit code);
//   - cross-file isolation, which every mode must keep: each file checks that module
//     state another file dirtied is clean.
// Watch mode runs as a scripted scenario: edit a test, break it, fix it, and edit a
// source module two tests share.
//
//   node validation/vitest-semantics/run.mjs        (VN_SEMANTICS_VITEST=4.1.11 for the floor)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const vitestVersion = process.env.VN_SEMANTICS_VITEST ?? "5.0.1";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-vitest-semantics-"));
const failures = [];

function sh(command, args, cwd, env = {}, timeout = 0) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout,
    killSignal: "SIGKILL",
  });
  if (result.error && result.error.code !== "ETIMEDOUT") throw result.error;
  return {
    status: result.status,
    timedOut: result.error?.code === "ETIMEDOUT",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

// A scenario that hangs fails loudly instead of stalling the job.
const SCENARIO_TIMEOUT_MS = 240_000;
// Run a subset while investigating: VN_SEMANTICS_ONLY="isolate,projects".
const only = process.env.VN_SEMANTICS_ONLY?.split(",").map((term) => term.trim());

function write(rel, contents) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

// --- fixture -------------------------------------------------------------------------

function setUp() {
  const pack = sh("npm", ["pack", "--pack-destination", root], packageRoot);
  if (pack.status !== 0) throw new Error(`npm pack failed:\n${pack.output}`);
  const tarball = fs.readdirSync(root).find((f) => f.endsWith(".tgz"));
  write(
    "package.json",
    `${JSON.stringify(
      {
        name: "vitest-native-semantics-gate",
        private: true,
        type: "module",
        dependencies: {
          "@babel/core": "^7.29.7",
          "@react-native/babel-preset": "0.87.0",
          "@vitest/coverage-v8": vitestVersion,
          react: "19.2.8",
          "react-native": "0.87.0",
          vite: "8.0.16",
          vitest: vitestVersion,
          "vitest-native": `file:${path.join(root, tarball)}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  const install = sh(
    "npm",
    [
      "install",
      // The repository's release cooldown (bunfig minimumReleaseAge): a version published
      // minutes ago can 404 while the registry propagates it, and is unvetted anyway.
      `--before=${new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()}`,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--legacy-peer-deps",
    ],
    root,
  );
  if (install.status !== 0) throw new Error(`npm install failed:\n${install.output}`);

  // Scenario overrides arrive as JSON so one config file serves every row.
  write(
    "vitest.config.mjs",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const plugin = JSON.parse(process.env.VN_PLUGIN ?? "{}");
const test = JSON.parse(process.env.VN_TEST ?? "{}");
export default defineConfig({
  plugins: [reactNative({ engine: "native", ...plugin })],
  test: { environment: "node", include: ["src/**/*.test.mjs"], ...test },
});
`,
  );
  // Shared module state: each file asserts clean, then dirties it.
  write("src/state.mjs", "export const state = { dirtiedBy: null };\n");
  write("src/label.mjs", 'export const label = () => "v1";\n');
  const fileCount = 6;
  for (let i = 0; i < fileCount; i++) {
    write(
      `src/unit-${i}.test.mjs`,
      `import fs from "node:fs";
import { expect, test } from "vitest";
import { Platform, StyleSheet } from "react-native";
import { state } from "./state.mjs";
import { label } from "./label.mjs";

const hot = process.env.VITEST_NATIVE_MEMORY_PLAN !== undefined;
if (process.env.VN_MODE_FILE) fs.appendFileSync(process.env.VN_MODE_FILE, hot ? "hot\\n" : "isolated\\n");

test("unit ${i} sees clean module state", () => {
  expect(state.dirtiedBy).toBe(null);
  state.dirtiedBy = ${i};
});

test("unit ${i} renders through real React Native", () => {
  expect(Platform.OS).toBe("ios");
  expect(StyleSheet.flatten([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  expect(label()).toBe(process.env.VN_EXPECT_LABEL ?? "v1");
});
`,
    );
  }
  write(
    "src/flaky.test.mjs",
    `import fs from "node:fs";
import { expect, test } from "vitest";
test("flaky passes on a later attempt when VN_FLAKY_FILE is set", () => {
  const f = process.env.VN_FLAKY_FILE;
  if (!f) return;
  const n = Number(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "0") + 1;
  fs.writeFileSync(f, String(n));
  expect(n).toBeGreaterThan(1);
});
`,
  );
  write(
    "src/failing.test.mjs",
    `import { expect, test } from "vitest";
test("fails when VN_FAIL is set", () => {
  if (process.env.VN_FAIL) expect(1).toBe(2);
});
`,
  );
  // Two Vitest projects, each with the plugin, for the projects scenario.
  for (const name of ["alpha", "beta"]) {
    write(
      `projects/${name}/vitest.config.mjs`,
      `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: { name: "${name}", environment: "node", root: import.meta.dirname, include: ["*.test.mjs"] },
});
`,
    );
    write(
      `projects/${name}/${name}.test.mjs`,
      `import fs from "node:fs";
import { expect, test } from "vitest";
import { Platform } from "react-native";
if (process.env.VN_MODE_FILE) fs.appendFileSync(process.env.VN_MODE_FILE, (process.env.VITEST_NATIVE_MEMORY_PLAN !== undefined ? "hot" : "isolated") + "\\n");
test("${name} runs real React Native", () => expect(Platform.OS).toBe("ios"));
`,
    );
  }
  return fileCount + 2;
}

// The registry and transform caches: under the install, and the tmpdir fallback.
function clearCaches() {
  fs.rmSync(path.join(root, "node_modules", ".cache"), { recursive: true, force: true });
  for (const dir of ["alpha", "beta"]) {
    fs.rmSync(path.join(root, "projects", dir, "node_modules"), { recursive: true, force: true });
  }
  fs.rmSync(path.join(os.tmpdir(), "vitest-native-cache"), { recursive: true, force: true });
}

// --- one scenario ----------------------------------------------------------------------

const vitestBin = () => path.join(root, "node_modules", "vitest", "vitest.mjs");

function runScenario({
  name,
  command = "run",
  plugin = {},
  test = {},
  args = [],
  env = {},
  before = () => {},
  after = () => {},
}) {
  const modeFile = path.join(root, `.mode-${name.replace(/\W+/g, "-")}`);
  const report = path.join(root, `.report-${name.replace(/\W+/g, "-")}.json`);
  const flaky = path.join(root, `.flaky-${name.replace(/\W+/g, "-")}`);
  for (const f of [modeFile, report, flaky]) fs.rmSync(f, { force: true });
  before();
  let result;
  try {
    result = sh(
      process.execPath,
      [vitestBin(), command, "--run", "--reporter=json", `--outputFile=${report}`, ...args],
      root,
      {
        VN_PLUGIN: JSON.stringify(plugin),
        VN_TEST: JSON.stringify(test),
        VN_MODE_FILE: modeFile,
        ...(env.VN_FLAKY_FILE === true ? { ...env, VN_FLAKY_FILE: flaky } : env),
      },
      SCENARIO_TIMEOUT_MS,
    );
  } finally {
    after();
  }
  const modes = fs.existsSync(modeFile)
    ? [...new Set(fs.readFileSync(modeFile, "utf8").trim().split("\n").filter(Boolean))]
    : [];
  const json = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : null;
  return {
    status: result.status,
    timedOut: result.timedOut,
    output: result.output,
    mode: modes.length === 1 ? modes[0] : modes.length ? "mixed" : "none",
    passed: json?.numPassedTests,
    failed: json?.numFailedTests,
    total: json?.numTotalTests,
  };
}

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}: ${detail}`);
    failures.push(`${name}: ${detail}`);
  }
}

// --- watch mode --------------------------------------------------------------------------

async function watchScenario() {
  const output = [];
  const child = spawn(process.execPath, [vitestBin(), "--watch"], {
    cwd: root,
    env: { ...process.env, VN_PLUGIN: "{}", VN_TEST: '{"include":["src/unit-*.test.mjs"]}' },
  });
  child.stdout.on("data", (d) => output.push(String(d)));
  child.stderr.on("data", (d) => output.push(String(d)));
  // eslint-disable-next-line no-control-regex
  const text = () => output.join("").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  const runs = () => (text().match(/Test Files /g) ?? []).length;
  const waitForRuns = async (n, ms = 60_000) => {
    const start = Date.now();
    while (runs() < n && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 250));
    // Let the summary finish printing.
    await new Promise((r) => setTimeout(r, 500));
    return runs() >= n;
  };
  const lastSummary = () => {
    const all = text().match(/^\s*Tests\s+\d[^\n]*/gm) ?? [];
    return all.at(-1) ?? "";
  };
  try {
    check("watch: initial run", await waitForRuns(1), text().slice(-400));
    const unit0 = path.join(root, "src/unit-0.test.mjs");
    const original = fs.readFileSync(unit0, "utf8");

    fs.appendFileSync(unit0, '\ntest("an added test", () => expect(1).toBe(2));\n');
    check(
      "watch: a broken test file reruns and fails",
      (await waitForRuns(2)) && /1 failed/.test(lastSummary()),
      lastSummary(),
    );

    fs.writeFileSync(unit0, original);
    check(
      "watch: fixing it reruns and passes",
      (await waitForRuns(3)) && /passed/.test(lastSummary()) && !/failed/.test(lastSummary()),
      lastSummary(),
    );

    // A shared source module edit reruns every file that imports it, each seeing the
    // new module — a reused worker must not serve the previous version.
    fs.writeFileSync(path.join(root, "src/label.mjs"), 'export const label = () => "v2";\n');
    check(
      "watch: a shared source edit reruns its importers against the new module",
      (await waitForRuns(4)) && /failed/.test(lastSummary()),
      `expected the importers to see v2 and fail their v1 expectation; got ${lastSummary()}`,
    );
  } finally {
    child.kill();
    fs.writeFileSync(path.join(root, "src/label.mjs"), 'export const label = () => "v1";\n');
  }
}

// --- matrix ------------------------------------------------------------------------------

try {
  const totalTests = 6 * 2 + 2;
  setUp();
  console.log(`vitest-native semantics gate (vitest ${vitestVersion}), fixture ${root}`);

  const all = { total: totalTests };
  const rows = [
    // [name, scenario, expected mode, expectation(result)]
    ["default", {}, "hot", (r) => r.status === 0 && r.passed === all.total],
    ["hotRuntime:false", { plugin: { hotRuntime: false } }, "isolated", (r) => r.status === 0],
    ["isolate:true", { test: { isolate: true } }, "isolated", (r) => r.status === 0],
    // Vitest's isolate:false shares the module graph across files, so cross-file state
    // DOES carry over: the state checks fail, which is Vitest's own behaviour.
    [
      "isolate:false keeps Vitest's shared module graph",
      { test: { isolate: false, maxWorkers: 1, fileParallelism: false } },
      "isolated",
      (r) => r.failed > 0,
    ],
    [
      "--no-isolate (CLI)",
      { args: ["--no-isolate", "--maxWorkers=1", "--no-file-parallelism"] },
      "isolated",
      (r) => r.failed > 0,
    ],
    ["--isolate (CLI)", { args: ["--isolate"] }, "isolated", (r) => r.status === 0],
    ["--pool=forks", { args: ["--pool=forks"] }, "isolated", (r) => r.status === 0],
    ["--pool=threads", { args: ["--pool=threads"] }, "isolated", (r) => r.status === 0],
    ["--maxWorkers=1", { args: ["--maxWorkers=1"] }, "isolated", (r) => r.status === 0],
    [
      "--no-file-parallelism",
      { args: ["--no-file-parallelism"] },
      "isolated",
      (r) => r.status === 0,
    ],
    ["--maxWorkers=2", { args: ["--maxWorkers=2"] }, "hot", (r) => r.status === 0],
    [
      // Explicitly requested hot that a CLI flag makes impossible fails at startup,
      // by name — never a run that errors mid-way and does not exit.
      "hotRuntime:true with --maxWorkers=1 fails fast",
      { plugin: { hotRuntime: true }, args: ["--maxWorkers=1"] },
      "none",
      (r) => r.status !== 0 && /HOT_RUNTIME_OVERRIDDEN|HOT_MEMORY_UNBOUNDED/.test(r.output),
    ],
    ["--sequence.shuffle", { args: ["--sequence.shuffle"] }, "hot", (r) => r.status === 0],
    [
      "-t filter",
      { args: ["-t", "renders through"] },
      "hot",
      (r) => r.status === 0 && r.passed === 6,
    ],
    ["--shard=1/2", { args: ["--shard=1/2"] }, "hot", (r) => r.status === 0],
    ["--shard=2/2", { args: ["--shard=2/2"] }, "hot", (r) => r.status === 0],
    [
      "retry passes a flaky test",
      { test: { retry: 2 }, env: { VN_FLAKY_FILE: true } },
      "hot",
      (r) => r.status === 0,
    ],
    [
      "a failing test without retry fails the run",
      { env: { VN_FAIL: "1" } },
      "hot",
      (r) => r.status !== 0 && r.failed === 1,
    ],
    [
      "--bail=1 stops the run",
      { args: ["--bail=1"], env: { VN_FAIL: "1" } },
      "hot",
      (r) => r.status !== 0 && r.failed >= 1,
    ],
    [
      "related <source> runs its importers",
      { command: "related", args: ["src/label.mjs"] },
      "hot",
      (r) => r.status === 0 && r.passed === 12,
    ],
    [
      "--passWithNoTests on an empty filter",
      { args: ["--passWithNoTests", "no-such-file"] },
      "none",
      (r) => r.status === 0,
    ],
    [
      "--coverage",
      { args: ["--coverage", "--coverage.reporter=text"] },
      "hot",
      (r) => r.status === 0,
    ],
    [
      // A Vitest project rooted in a subdirectory with no node_modules of its own, as
      // hoisted monorepo packages are. React Native 0.87's deep self-imports must
      // still resolve; they did not while the registry cache fell back to tmpdir.
      "a project root below the install",
      { args: ["--config", "projects/alpha/vitest.config.mjs"], before: clearCaches },
      "hot",
      (r) => r.status === 0 && r.passed === 1,
    ],
    ...(process.platform === "win32"
      ? []
      : [
          [
            // A read-only node_modules sends the registry cache to tmpdir, outside the
            // project; resolution from the registry's own code must not depend on where
            // its cache file lives.
            "a read-only node_modules (cache in tmpdir)",
            {
              before: () => {
                clearCaches();
                fs.chmodSync(path.join(root, "node_modules"), 0o555);
              },
              after: () => fs.chmodSync(path.join(root, "node_modules"), 0o755),
            },
            "hot",
            (r) => r.status === 0 && r.passed === all.total,
          ],
        ]),
    [
      "projects with the plugin in each",
      { test: { projects: ["projects/*"] }, args: [], before: clearCaches },
      "hot",
      (r) => r.status === 0 && r.passed === 2,
    ],
  ];

  for (const [name, scenario, expectedMode, outcome] of rows) {
    if (only && !only.some((term) => name.includes(term))) continue;
    console.log(`\n${name}`);
    const result = runScenario({ name, ...scenario });
    if (result.timedOut) {
      check(`${name}: finishes`, false, `no result after ${SCENARIO_TIMEOUT_MS / 1000}s`);
      continue;
    }
    check(
      `${name}: runtime`,
      result.mode === expectedMode,
      `ran ${result.mode}, expected ${expectedMode}`,
    );
    check(
      `${name}: outcome`,
      outcome(result),
      `exit ${result.status}, passed ${result.passed}, failed ${result.failed}\n${result.output.slice(-1200)}`,
    );
  }

  if (!only || only.includes("watch")) {
    console.log("\nwatch mode");
    await watchScenario();
  }

  if (failures.length) {
    console.error(
      `\n${failures.length} semantics check(s) failed:\n  - ${failures.join("\n  - ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nvitest-native behaves as Vitest under every scenario.");
  }
} finally {
  if (process.env.VN_KEEP_SEMANTICS === "1") console.log(`retained fixture: ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
}
