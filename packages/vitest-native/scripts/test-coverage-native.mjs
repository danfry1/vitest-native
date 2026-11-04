// Coverage of the source Node compiles must match coverage of the same source loaded by
// Vite: same lines, same verdicts, and no file left out (tests-native/coverage-native).
//
//   vite     Nothing linked: Vite loads the workspace package from its source. The
//            reference.
//   default  The package is linked into node_modules, as a workspace install links it,
//            so the engine detects it (it peers on react-native) and Node compiles it.
//   hot      The same under the hot runtime, both test files in one worker.
//   projects tests-native/coverage-projects: coverage configured in a root config that
//            lists one project, and vitest-native only in that project's config. A
//            workspace package the app aliases to its source and Node owns must be
//            reported, with what ran covered and what did not uncovered.
//
// In every mode @vitest/coverage-v8 must not fail to parse anything, the report must
// hold exactly the project's four source files (the untested one through
// `coverage.include`), and a Flow + JSX package under node_modules must not appear. In
// the Node modes every line the reference counts must carry the reference's verdict, and
// the only lines it adds must be the module's import and re-export lines, which Babel's
// CommonJS output runs as statements of their own.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const fixture = path.join(packageRoot, "tests-native", "coverage-native");
const nodeModules = path.join(fixture, "node_modules");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-coverage-native-"));

const SOURCES = [
  "packages/rnlib/src/Badge.tsx",
  "packages/rnlib/src/index.ts",
  "packages/rnlib/src/untested.ts",
  "src/app-math.ts",
];
// Lines Babel's CommonJS output counts that Vite's output does not: `import … from`
// becomes a `require`, and an export an assignment to `exports`. They must be the
// module's own import and export lines, covered exactly when the module ran.
const MODULE_LINE = /^\s*(?:import|export)\b/;

function link() {
  fs.rmSync(nodeModules, { recursive: true, force: true });
  fs.mkdirSync(path.join(nodeModules, "@cov"), { recursive: true });
  fs.symlinkSync(
    path.join(fixture, "packages", "rnlib"),
    path.join(nodeModules, "@cov", "rnlib"),
    process.platform === "win32" ? "junction" : "dir",
  );
  // A real directory under node_modules, as an install leaves a published package.
  fs.cpSync(path.join(fixture, "vendor", "flow-jsx-lib"), path.join(nodeModules, "flow-jsx-lib"), {
    recursive: true,
  });
}

function unlinkWorkspacePackage() {
  fs.rmSync(path.join(nodeModules, "@cov"), { recursive: true, force: true });
}

/** Per source file, each line with a statement: 1 if one ran, else 0. */
function lineVerdicts(entry) {
  const lines = {};
  for (const [id, statement] of Object.entries(entry.statementMap)) {
    const line = statement.start.line;
    lines[line] = Math.max(lines[line] ?? 0, entry.s[id] > 0 ? 1 : 0);
  }
  return lines;
}

function run(mode) {
  const reports = path.join(outDir, mode);
  const result = spawnSync(process.execPath, [vitestEntry, "run"], {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", VN_COVERAGE_MODE: mode, VN_COVERAGE_DIR: reports },
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const fail = (message) => {
    throw new Error(`${mode}: ${message}\n${output}`);
  };
  if (result.status !== 0) fail(`vitest exited ${result.status}`);
  const parseFailures = output.match(/Failed to parse [^\n]*/g) ?? [];
  if (parseFailures.length > 0) fail(`coverage failed to parse:\n${parseFailures.join("\n")}`);
  if (/\[vitest-native\] coverage:/.test(output)) fail("a file was left out of the report");
  const report = JSON.parse(fs.readFileSync(path.join(reports, "coverage-final.json"), "utf8"));
  const files = Object.keys(report)
    .map((file) => path.relative(fixture, file).split(path.sep).join("/"))
    .sort();
  if (JSON.stringify(files) !== JSON.stringify(SOURCES)) {
    fail(`the report holds ${JSON.stringify(files)}, expected ${JSON.stringify(SOURCES)}`);
  }
  return {
    fail,
    lines: Object.fromEntries(
      Object.entries(report).map(([file, entry]) => [
        path.relative(fixture, file).split(path.sep).join("/"),
        lineVerdicts(entry),
      ]),
    ),
  };
}

function matchesReference(mode, reference) {
  const { lines, fail } = run(mode);
  for (const file of SOURCES) {
    const expected = reference[file];
    const got = lines[file];
    const covered = Object.values(expected).filter(Boolean).length;
    for (const [line, verdict] of Object.entries(expected)) {
      if (got[line] !== verdict) {
        fail(
          `${file}:${line} is ${got[line] === undefined ? "not counted" : got[line] ? "covered" : "uncovered"}, ` +
            `but ${verdict ? "covered" : "uncovered"} when Vite loads it\n` +
            `node: ${JSON.stringify(got)}\nvite: ${JSON.stringify(expected)}`,
        );
      }
    }
    const text = fs.readFileSync(path.join(fixture, file), "utf8").split("\n");
    const ran = file.endsWith("/untested.ts") ? 0 : 1;
    const extra = Object.keys(got).filter((line) => !(line in expected));
    if (extra.some((line) => !MODULE_LINE.test(text[line - 1]) || got[line] !== ran)) {
      fail(
        `${file}: lines ${JSON.stringify(extra)} are counted only under Node, and are not ` +
          `import or export lines with the module's own verdict: ${JSON.stringify(got)}`,
      );
    }
    if (file.startsWith("packages/rnlib/src/index") && covered === 0) {
      fail(`${file}: nothing covered`);
    }
  }
}

/** The projects shape: the provider is installed from a project's config. */
function projects() {
  const dir = path.join(packageRoot, "tests-native", "coverage-projects");
  const appModules = path.join(dir, "packages", "app", "node_modules");
  const reports = path.join(outDir, "projects");
  try {
    fs.mkdirSync(appModules, { recursive: true });
    fs.symlinkSync(
      path.join(dir, "packages", "lib"),
      path.join(appModules, "lib"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const result = spawnSync(process.execPath, [vitestEntry, "run", "--coverage"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0", VN_COVERAGE_DIR: reports },
    });
    if (result.error) throw result.error;
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const fail = (message) => {
      throw new Error(`projects: ${message}\n${output}`);
    };
    if (result.status !== 0) fail(`vitest exited ${result.status}`);
    if (/Failed to parse/.test(output)) fail("coverage failed to parse");
    const report = JSON.parse(fs.readFileSync(path.join(reports, "coverage-final.json"), "utf8"));
    const entry = Object.entries(report).find(([file]) =>
      file.split(path.sep).join("/").endsWith("packages/lib/src/index.ts"),
    )?.[1];
    if (!entry) fail(`lib/src/index.ts is not in the report: ${Object.keys(report)}`);
    // add() ran, sub() did not.
    const calls = Object.fromEntries(
      Object.entries(entry.fnMap).map(([id, fn]) => [fn.decl.start.line, entry.f[id]]),
    );
    if (!(calls[2] > 0) || calls[3] !== 0) {
      fail(`expected add (line 2) called and sub (line 3) not, got ${JSON.stringify(calls)}`);
    }
  } finally {
    fs.rmSync(appModules, { recursive: true, force: true });
  }
}

try {
  link();
  unlinkWorkspacePackage();
  const reference = run("vite").lines;
  // The reference itself must say something: covered and uncovered lines in the library.
  const library = reference["packages/rnlib/src/index.ts"];
  if (!Object.values(library).includes(1) || !Object.values(library).includes(0)) {
    throw new Error(`vite: the reference is degenerate: ${JSON.stringify(library)}`);
  }
  link();
  matchesReference("default", reference);
  matchesReference("hot", reference);
  projects();
  console.log(
    "[vitest-native] coverage of Node-compiled source matches Vite's, default, hot and " +
      "from a project config, with nothing failing to parse",
  );
} finally {
  fs.rmSync(nodeModules, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
}
