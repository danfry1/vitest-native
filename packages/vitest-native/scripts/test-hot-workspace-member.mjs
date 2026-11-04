// A React Native workspace library that Node loads must be evaluated again for every
// test file under the hot runtime, and nothing else may change: the gate counts every
// module Node loads, per test file (tests-native/hot-workspace-member/load-count.setup.ts).
//
//   member     The workspace's packages are linked into its node_modules, as an install
//              links them, so the engine detects packages/feature (it peers on
//              react-native) and Node loads it. Every file must pass, each file that
//              touches the library must load exactly its one source file once more than
//              a file that does not, and nothing else outside node_modules may load per
//              file: not the project's source, not this engine, not the test stack.
//   no-member  The same files with nothing linked: Vite loads the library, so Node
//              must load nothing outside node_modules at all.
//
// In both, React, React Native and the test stack load once per worker under one URL:
// a second load of any of them is a twin runtime.
//
// Counting needs Node's in-thread hooks (module.registerHooks, Node 22.15 on). Before
// that only the test files' own checks run.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nodeModule, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const fixture = path.join(packageRoot, "tests-native", "hot-workspace-member");
const links = path.join(fixture, "node_modules");
const member = fs.realpathSync(path.join(fixture, "packages", "feature")).replace(/\\/g, "/");
const counting = typeof nodeModule.registerHooks === "function";
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hot-workspace-member-"));

const STAMP = /[?&]vnhot=\d+/;
// A CommonJS module a file imports is served behind a generation facade (generationFacade
// in src/native/loader.mjs): one evaluation, seen here as two loads. The first generation
// is the facade and the module it re-exports (`&vnnode`); a later one is the facade and
// the module's own load through `require`. Each pair is counted once, as the module.
const NODE_SERVED = "&vnnode";
function evaluations(urls) {
  const facades = new Set(urls.filter((url) => STAMP.test(url)).map(fileOf));
  return urls.filter((url) =>
    url.endsWith(NODE_SERVED)
      ? !urls.includes(url.slice(0, -NODE_SERVED.length))
      : STAMP.test(url) || !facades.has(fileOf(url)),
  );
}
const fileOf = (url) => fileURLToPath(url.replace(/[?#].*$/, "")).replace(/\\/g, "/");
const inNodeModules = (file) => /\/node_modules\//.test(file);
const isMember = (file) => file.startsWith(`${member}/`);
// The worker's resident runtime: React, React Native and the test stack. In-repo this
// engine is loaded from its own dist, outside node_modules.
const RESIDENT =
  /\/node_modules\/(react|react-dom|react-is|scheduler|react-native|@react-native\/[^/]+|vitest|@vitest\/[^/]+|chai|vitest-native)\/|\/packages\/vitest-native\/dist\//;

function link() {
  fs.mkdirSync(path.join(links, "@m"), { recursive: true });
  for (const name of ["feature", "validator"]) {
    fs.symlinkSync(
      path.join(fixture, "packages", name),
      path.join(links, "@m", name),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
}

function run(mode) {
  const report = path.join(outDir, `${mode}.report.json`);
  const log = path.join(outDir, `${mode}.loads.json`);
  const result = spawnSync(
    process.execPath,
    [vitestEntry, "run", "--reporter=default", "--reporter=json", `--outputFile.json=${report}`],
    {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0", VN_LOAD_LOG: log },
    },
  );
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const fail = (message) => {
    throw new Error(`${mode}: ${message}\n${output}`);
  };
  if (!fs.existsSync(report)) fail("no report was written");
  const json = JSON.parse(fs.readFileSync(report, "utf8"));
  const failed = json.testResults.filter((entry) => entry.status !== "passed");
  if (result.status !== 0 || json.testResults.length !== 4 || failed.length > 0) {
    fail(
      `expected 4 passing files, got exit ${result.status}, ${json.testResults.length} files, ` +
        `failed: ${failed.map((entry) => path.basename(entry.name)).join(", ") || "none"}`,
    );
  }
  if (!counting) return null;
  if (!fs.existsSync(log)) fail("no load log was written");
  const loads = JSON.parse(fs.readFileSync(log, "utf8"));
  const files = new Map(
    loads.files.map((entry) => [path.basename(entry.file), evaluations(entry.loads)]),
  );
  if (files.size !== 4) fail(`expected loads for 4 files, got ${[...files.keys()].join(", ")}`);

  // No twin runtime, anywhere in the worker's life.
  const all = [...loads.boot, ...loads.between, ...loads.files.flatMap((entry) => entry.loads)];
  const seen = new Set();
  for (const url of all) {
    const file = fileOf(url);
    if (!RESIDENT.test(file)) continue;
    if (STAMP.test(url) || seen.has(file)) fail(`twin runtime: ${url} was loaded again`);
    seen.add(file);
  }
  return { files, between: loads.between, fail };
}

const counts = (files) => Object.fromEntries([...files].map(([file, urls]) => [file, urls.length]));

function check() {
  link();
  const withMember = run("member");
  fs.rmSync(links, { recursive: true, force: true });
  const noMember = run("no-member");
  if (!withMember) {
    return `evaluated per file (Node ${process.version} has no module.registerHooks, so loads were not counted)`;
  }
  const { files, between, fail } = withMember;
  for (const [file, urls] of files) {
    const touches = file !== "c.test.ts";
    const memberLoads = urls.filter((url) => isMember(fileOf(url)));
    const expected = touches ? [`${member}/src/index.ts`] : [];
    const got = memberLoads.map(fileOf);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      fail(
        `${file}: expected the library to load ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
      );
    }
    if (touches && !memberLoads.every((url) => STAMP.test(url))) {
      fail(`${file}: the library loaded without a per-file stamp: ${memberLoads.join(", ")}`);
    }
  }
  for (const url of [...files.values()].slice(1).flat().concat(between)) {
    const file = fileOf(url);
    if (!inNodeModules(file) && !isMember(file)) {
      fail(`a file outside node_modules that Node does not own loaded per file: ${url}`);
    }
  }
  for (const url of [...noMember.files.values()].flat().concat(noMember.between)) {
    if (!inNodeModules(fileOf(url))) {
      noMember.fail(`Node loaded a file outside node_modules with no workspace library: ${url}`);
    }
  }
  // Count: the library adds its one file to each file that touches it after another
  // file (b, d), and nothing to a file that does not (c).
  const memberCounts = counts(files);
  const plainCounts = counts(noMember.files);
  const against = `${JSON.stringify(memberCounts)} against ${JSON.stringify(plainCounts)} without it`;
  for (const file of ["b.test.ts", "d.test.ts"]) {
    if (memberCounts[file] !== plainCounts[file] + 1) {
      fail(`${file}: the library should add exactly its one file to Node's loads: ${against}`);
    }
  }
  if (memberCounts["c.test.ts"] !== plainCounts["c.test.ts"]) {
    fail(`c.test.ts: a file that does not touch the library changed its loads: ${against}`);
  }
  return `evaluated per file; Node loads per file ${against}`;
}

try {
  console.log(`[vitest-native] hot workspace library: ${check()}`);
} finally {
  fs.rmSync(links, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
}
