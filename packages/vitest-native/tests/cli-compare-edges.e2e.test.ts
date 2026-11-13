/**
 * `vitest-native compare`: the cases an adversarial review of the first version found
 * that run Vitest for real on a scratch project, with a Jest report written for it
 * (tests/support/compare-helpers.ts); the Jest side of each is the plain result Jest 30
 * gives those files (all passing unless noted). Each spawns Vitest, so they run under
 * vitest.e2e.config.ts (`test:e2e`), not in the unit suite.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GUARDIAN, WATCHDOG } from "../src/cli/compare-run.js";
import { jestReport, runCli, scratchProject, treeBytes } from "./support/compare-helpers.js";

const posix = process.platform !== "win32";

const VITEST_CONFIG = `export default { test: { globals: true, include: ["**/*.check.js"] } };\n`;

// ---------------------------------------------------------------------------
// 1. `vitest run` must exit 0, and every copy of a test must pass
// ---------------------------------------------------------------------------

describe("compare: the verdict includes `vitest run`'s exit code", () => {
  it("fails on an unhandled rejection that only Vitest's exit code shows", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/unhandled.check.js":
          `test("passes but leaks a rejection", async () => {\n` +
          `  Promise.reject(new Error("unhandled under vitest"));\n` +
          `  await new Promise((r) => setTimeout(r, 20));\n});\n`,
      },
    });
    const jest = jestReport(root, {
      "src/unhandled.check.js": [{ title: "passes but leaks a rejection" }],
    });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code).toBe(1);
    // The headline leads with what failed.
    expect(text).toMatch(
      /^✗ `vitest run` exits 1 \(no vitest-native engine reported\), although all 1 test that pass under Jest also pass under Vitest:$/m,
    );
    expect(text).toContain("Unhandled Rejection: Error: unhandled under vitest");
    expect(text).not.toMatch(/^✓/m);
  }, 120_000);

  it("fails on process.exit in a test file and on a globalSetup teardown that throws", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { globals: true, include: ["**/*.check.js"], globalSetup: ["./gs.mjs"] } };\n`,
        "gs.mjs": `export default () => () => { throw new Error("globalTeardown failed"); };\n`,
        // The hook waits past the exit timer, so the worker is still running when it fires.
        "src/exit.check.js":
          `test("b", () => {});\n` +
          `afterAll(async () => {\n` +
          `  setTimeout(() => process.exit(0), 0);\n` +
          `  await new Promise((r) => setTimeout(r, 20));\n});\n`,
      },
    });
    const jest = jestReport(root, { "src/exit.check.js": [{ title: "b" }] });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code).toBe(1);
    expect(text).toContain('Uncaught Exception: Error: process.exit unexpectedly called with "0"');
    expect(text).toContain("error during close: Error: globalTeardown failed");
  }, 120_000);

  it("fails on a failing test file only Vitest collects", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { globals: true } };\n`,
        "src/a.test.js": `test("unit", () => {});\n`,
        "e2e/login.spec.js": `test("needs a device", () => { throw new Error("no simulator"); });\n`,
      },
    });
    const jest = jestReport(root, { "src/a.test.js": [{ title: "unit" }] });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code).toBe(1);
    expect(text).toContain("1 test fails under Vitest (1 Jest did not run)");
  }, 120_000);

  it("counts a test in two Vitest projects as passing only if both copies pass", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs":
          `export default { test: { globals: true, projects: [\n` +
          `  { extends: true, test: { name: "ios", include: ["**/*.check.js"], env: { PLAT: "ios" } } },\n` +
          `  { extends: true, test: { name: "android", include: ["**/*.check.js"], env: { PLAT: "android" } } },\n` +
          `] } };\n`,
        "src/plat.check.js": `test("works on every platform", () => { expect(process.env.PLAT).not.toBe("android"); });\n`,
      },
    });
    const jest = jestReport(root, { "src/plat.check.js": [{ title: "works on every platform" }] });
    const out = path.join(path.dirname(root), `${path.basename(root)}-report.json`);
    const { code, text } = await runCli(["--root", root, "--jest-results", jest, "--json", out]);
    expect(code).toBe(1);
    expect(text).toContain("✗ 1 of the 1 test that pass under Jest do not pass under Vitest");
    const entry = JSON.parse(fs.readFileSync(out, "utf8")).tests[0];
    expect(entry).toMatchObject({ bucket: "regression", vitest: { status: "failed", copies: 2 } });
    expect(text).toContain("(Jest 1×, Vitest 2×)");
  }, 120_000);

  it("does not confirm a Jest project Vitest drops, end to end", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/plat.check.js": `test("t", () => { expect(1).toBe(1); });\n`,
      },
    });
    // What Jest 30 writes for `projects: [ios, android]`: the file once per project.
    const file = jestReport(root, { "src/plat.check.js": [{ title: "t" }] });
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.testResults.push(json.testResults[0]);
    fs.writeFileSync(file, JSON.stringify(json));
    const { code, text } = await runCli(["--root", root, "--jest-results", file]);
    expect(code).toBe(1);
    expect(text).toContain("1 of the 1 test that pass under Jest do not pass under Vitest");
    expect(text).toContain("(Jest 2×, Vitest 1×)");
  }, 120_000);
});

describe("compare: what Vitest prints but its exit code hides", () => {
  it("does not take the engine from a test that prints the banner", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/a.check.js": `test("a", () => { console.log("[vitest-native] engine: native — real react-native"); });\n`,
      },
    });
    const jest = jestReport(root, { "src/a.check.js": [{ title: "a" }] });
    const { text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(text).toContain("(no vitest-native engine reported)");
    expect(text).not.toContain("engine: native");
  }, 120_000);

  it("prints unhandled errors Vitest's config tells it to ignore", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { globals: true, include: ["**/*.check.js"], dangerouslyIgnoreUnhandledErrors: true } };\n`,
        "src/u.check.js": `test("leaks", async () => { Promise.reject(new Error("ignored rejection")); await new Promise((r) => setTimeout(r, 20)); });\n`,
      },
    });
    const jest = jestReport(root, { "src/u.check.js": [{ title: "leaks" }] });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code, text).toBe(0);
    expect(text).toContain("! Vitest printed these errors but exited 0");
    expect(text).toContain("Unhandled Rejection: Error: ignored rejection");
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 2–3. Snapshots: nothing is written, whatever the config, env or arguments say
// ---------------------------------------------------------------------------

describe("compare: snapshots are never written", () => {
  const saved = process.env.UPDATE_SNAPSHOT;
  afterEach(() => {
    if (saved === undefined) delete process.env.UPDATE_SNAPSHOT;
    else process.env.UPDATE_SNAPSHOT = saved;
  });

  it("leaves every file alone with a config that shares Jest's __snapshots__, sets update: true, and UPDATE_SNAPSHOT=all", async () => {
    process.env.UPDATE_SNAPSHOT = "all";
    const root = scratchProject({
      files: {
        "vitest.config.mjs":
          `import path from "node:path";\n` +
          `export default { test: { globals: true, include: ["**/*.check.js"], update: true,\n` +
          `  resolveSnapshotPath: (t, e) => path.join(path.dirname(t), "__snapshots__", path.basename(t) + e) } };\n`,
        "src/snap.check.js":
          `describe("a", () => { test("b", () => { expect({ a: 1 }).toMatchSnapshot(); }); });\n` +
          `test("plain", () => { expect("x").toMatchSnapshot(); });\n` +
          `test("inline new", () => { expect({ c: 3 }).toMatchInlineSnapshot(); });\n` +
          `test("file snapshot", async () => { await expect("hello").toMatchFileSnapshot("./__file__/out.txt"); });\n`,
        "src/__snapshots__/snap.check.js.snap":
          `// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing\n\n` +
          'exports[`a b 1`] = `\n{\n  "a": 1,\n}\n`;\n\n' +
          'exports[`plain 1`] = `"x"`;\n',
      },
    });
    const before = treeBytes(root);
    const jest = jestReport(root, {
      "src/snap.check.js": [
        { ancestors: ["a"], title: "b" },
        { title: "plain" },
        { title: "inline new" },
        { title: "file snapshot" },
      ],
    });
    const out = path.join(path.dirname(root), `${path.basename(root)}-report.json`);
    const { code, text } = await runCli(["--root", root, "--jest-results", jest, "--json", out]);
    expect(treeBytes(root)).toEqual(before);
    expect(code, text).toBe(1);
    const hints = Object.fromEntries(
      JSON.parse(fs.readFileSync(out, "utf8")).tests.map((t: { title: string; hint?: string }) => [
        t.title,
        t.hint,
      ]),
    );
    // Only the .snap cases get the recipe; inline and file snapshots fail with the same
    // message but are not recorded that way.
    expect(hints).toEqual({
      b: "shared-snapshot-dir-nested",
      plain: "shared-snapshot-dir",
      "inline new": undefined,
      "file snapshot": undefined,
    });
    expect(text).toContain("This snapshot's key is the same in both runners");
    expect(text).toContain(
      "Vitest names this snapshot differently (`a > b 1`, where Jest writes `a b 1`)",
    );
    expect(text).not.toContain("then run `vitest run` once and review");
  }, 120_000);

  it("isolates the snapshots of an inline project that does not extend the root config", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs":
          `export default { test: { projects: [\n` +
          `  { test: { name: "own", globals: true, include: ["**/*.check.js"] } },\n` +
          `] } };\n`,
        "src/s.check.js": `test("plain", () => { expect("x").toMatchSnapshot(); });\n`,
        "src/__vitest_snapshots__/s.check.js.snap": `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[\`plain 1\`] = \`"x"\`;\n`,
        "src/__snapshots__/s.check.js.snap": // Jest's value differs, so reading Jest's file instead fails the test.
          `// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing\n\nexports[\`plain 1\`] = \`"jest"\`;\n`,
      },
    });
    const before = treeBytes(root);
    const jest = jestReport(root, { "src/s.check.js": [{ title: "plain" }] });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(treeBytes(root)).toEqual(before);
    // It read Vitest's own recorded snapshot, from the isolated copy.
    expect(code, text).toBe(0);
  }, 120_000);

  it("reports other files a test writes, ignores output directories, and still compares", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/w.check.js":
          `const fs = require("node:fs"), path = require("node:path");\n` +
          `test("writes", () => {\n` +
          `  if (typeof vi === "undefined") return;\n` +
          `  fs.writeFileSync(path.join(__dirname, "out.txt"), "x");\n` +
          `  for (const d of ["coverage", "android/build", "ios/Pods/P"]) {\n` +
          `    fs.mkdirSync(path.join(__dirname, "..", d), { recursive: true });\n` +
          `    fs.writeFileSync(path.join(__dirname, "..", d, "f.js"), "x");\n` +
          `  }\n});\n`,
      },
    });
    const jest = jestReport(root, { "src/w.check.js": [{ title: "writes" }] });
    const out = path.join(path.dirname(root), `${path.basename(root)}-report.json`);
    const { code, text } = await runCli(["--root", root, "--jest-results", jest, "--json", out]);
    expect(code, text).toBe(0);
    expect(text).toContain("The runs wrote 1 other file(s) in the project:");
    expect(text).not.toContain("compare must never do");
    const written = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(written.projectWrites).toEqual(["added src/out.txt"]);
    expect(written.projectChanges).toEqual([]);
  }, 120_000);

  it("fails the run on any change to a file that existed, wherever it is, and follows links only inside the root", async () => {
    const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-shared-"));
    fs.writeFileSync(path.join(outside, "lib.js"), "module.exports = 1;\n");
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/gql/a.graphql": "type Query { a: Int }\n",
        // A coverage/ that is not the root's: the project's own files, checked.
        "src/features/coverage/__snapshots__/plan.check.js.snap": "// Jest Snapshot v1\n",
        "packages/shared/lib.js": "module.exports = 1;\n",
        "src/w.check.js":
          `const fs = require("node:fs"), path = require("node:path");\n` +
          `test("edits files", () => {\n  if (typeof vi === "undefined") return;\n` +
          `  fs.appendFileSync(path.join(__dirname, "gql/a.graphql"), " # edited");\n` +
          `  fs.appendFileSync(path.join(__dirname, "features/coverage/__snapshots__/plan.check.js.snap"), "x");\n` +
          `  fs.appendFileSync(path.join(__dirname, "inside/lib.js"), "// x\\n");\n` +
          `  fs.appendFileSync(path.join(__dirname, "outside/lib.js"), "// x\\n");\n});\n`,
      },
    });
    fs.symlinkSync(
      path.join(root, "packages", "shared"),
      path.join(root, "src", "inside"),
      "junction",
    );
    fs.symlinkSync(outside, path.join(root, "src", "outside"), "junction");
    // A cycle the walk must not follow forever.
    fs.symlinkSync(path.join(root, "src"), path.join(root, "src", "loop"), "junction");
    const jest = jestReport(root, { "src/w.check.js": [{ title: "edits files" }] });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    fs.rmSync(outside, { recursive: true, force: true });
    expect(code).toBe(2);
    // A snapshot and a source file: compare's to answer for.
    expect(text).toContain(
      "✗ The runs changed 2 snapshot or source file(s) in the project, which compare must never do:",
    );
    // Another tracked file the suite rewrote: still exit 2, worded as the suite's doing.
    expect(text).toContain(
      "✗ The test run changed these existing files (compare's comparison does not count while the suite rewrites tracked files):",
    );
    // The tests agree, but a run that changed files gets no ✓.
    expect(text).not.toMatch(/^✓/m);
    expect(text).toContain(
      "but the runs changed files in the project (listed below), so the comparison does not count.",
    );
    expect(text).toContain("changed src/gql/a.graphql");
    expect(text).toContain("changed src/features/coverage/__snapshots__/plan.check.js.snap");
    expect(text).toMatch(/changed (packages\/shared|src\/inside)\/lib\.js/);
    // The link out of the project is not followed.
    expect(text).not.toContain("outside/lib.js");
  }, 120_000);

  it("turns coverage off, so a config that enables it neither loads a provider nor writes coverage/", async () => {
    const root = scratchProject({
      files: {
        // No coverage provider is installed in the scratch project: enabling coverage
        // would fail the run.
        "vitest.config.mjs": `export default { test: { globals: true, include: ["**/*.check.js"], coverage: { enabled: true } } };\n`,
        "src/a.check.js": `test("a", () => {});\n`,
      },
    });
    const jest = jestReport(root, { "src/a.check.js": [{ title: "a" }] });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code, text).toBe(0);
    expect(fs.existsSync(path.join(root, "coverage"))).toBe(false);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 4. The report
// ---------------------------------------------------------------------------

describe("compare: the report carries no source or absolute path", () => {
  it("keeps a TypeScript file's source out of the report when Vitest cannot parse it", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { globals: true, include: ["**/*.check.{js,ts}"] } };\n`,
        "src/syntax.check.ts":
          `const internalApiKey: string = "sk-live-INTERNAL-9999";\n` +
          `test("broken", () => { const x = = 1; expect(internalApiKey).toBe(x); });\n`,
        "src/tmp.check.js": `test("tmp path", () => { throw new Error("cannot open " + require("os").tmpdir() + "/x.json"); });\n`,
      },
    });
    const jest = jestReport(root, {
      "src/syntax.check.ts": [{ title: "broken" }],
      "src/tmp.check.js": [{ title: "tmp path" }],
    });
    const out = path.join(path.dirname(root), `${path.basename(root)}-report.json`);
    await runCli(["--root", root, "--jest-results", jest, "--json", out]);
    const json = fs.readFileSync(out, "utf8");
    expect(json).not.toContain("internalApiKey");
    expect(json).not.toContain("sk-live");
    expect(json).not.toContain(os.tmpdir());
    expect(json).not.toContain(fs.realpathSync(os.tmpdir()));
    expect(json).toContain("<tmp>/x.json");
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 5–6. Process hygiene
// ---------------------------------------------------------------------------

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return check();
}

describe.skipIf(!posix)("compare: processes", () => {
  it("cleans up and exits 130 on a signal after Vitest has finished", async () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-sigint-"));
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    try {
      const root = scratchProject({
        files: { "vitest.config.mjs": VITEST_CONFIG, "src/a.check.js": `test("a", () => {});\n` },
      });
      const jest = jestReport(root, { "src/a.check.js": [{ title: "a" }] });
      const { main } = await import("../src/cli/index.js");
      const lines: string[] = [];
      // Sent while compare renders its summary, after both runs.
      const code = await main(["compare", "--root", root, "--jest-results", jest], (l) => {
        if (l.startsWith("Jest    ")) process.emit("SIGINT", "SIGINT");
        lines.push(l);
      });
      expect(code, lines.join("\n")).toBe(130);
      expect(lines).toContain("✗ compare was interrupted.");
      expect(fs.existsSync(path.join(root, "node_modules", ".vitest-native"))).toBe(false);
      expect(
        fs
          .readdirSync(tmp)
          .filter((f) => f.startsWith("vn-compare-") && !f.startsWith("vn-compare-e2e-")),
      ).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);

  it("does not wait for a detached process a test leaves holding the output pipe", async () => {
    const pidFile = path.join(os.tmpdir(), `vn-daemon-${process.pid}-${Date.now()}.pid`);
    const root = scratchProject({
      files: {
        // Threads share the Vitest process's stdout, which is compare's pipe.
        "vitest.config.mjs": `export default { test: { globals: true, pool: "threads", include: ["**/*.check.js"] } };\n`,
        "src/d.check.js":
          `const { spawn } = require("node:child_process");\n` +
          `test("starts a mock server", () => {\n` +
          `  const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { detached: true, stdio: "inherit" });\n` +
          `  require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));\n  c.unref();\n});\n`,
      },
    });
    const jest = jestReport(root, { "src/d.check.js": [{ title: "starts a mock server" }] });
    const started = Date.now();
    try {
      const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
      expect(code, text).toBe(0);
      expect(Date.now() - started).toBeLessThan(30_000);
    } finally {
      const pid = Number(fs.readFileSync(pidFile, "utf8"));
      // The test's own daemon is the test's: it outlives the run, as it would under Vitest.
      if (alive(pid)) process.kill(pid, "SIGKILL");
      fs.rmSync(pidFile, { force: true });
    }
  }, 120_000);

  it("stops the runner and removes compare's directories when compare itself is killed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-watchdog-"));
    const cleanupDir = path.join(dir, "compare-temp");
    fs.mkdirSync(cleanupDir);
    const runnerPid = path.join(dir, "runner.pid");
    const watchdog = path.join(dir, "watchdog.js");
    fs.writeFileSync(watchdog, WATCHDOG);
    // A stand-in for compare: it starts the watchdog as compare does, then is SIGKILLed.
    const parent = spawn(
      process.execPath,
      [
        "-e",
        `const { spawn } = require("node:child_process");
         const fs = require("node:fs");
         const [watchdog, cleanup, pidFile] = process.argv.slice(1);
         spawn(process.execPath, ["-e", fs.readFileSync(watchdog, "utf8"), "--", JSON.stringify([cleanup]),
           "-e", "require('node:fs').writeFileSync(" + JSON.stringify(pidFile) + ", String(process.pid)); setInterval(() => {}, 1000)"],
           { stdio: ["ignore", "ignore", "ignore", "ipc"], detached: true });
         setInterval(() => {}, 1000);`,
        "--",
        watchdog,
        cleanupDir,
        runnerPid,
      ],
      { stdio: "ignore" },
    );
    try {
      expect(
        await until(
          () => fs.existsSync(runnerPid) && fs.readFileSync(runnerPid, "utf8") !== "",
          10_000,
        ),
      ).toBe(true);
      const pid = Number(fs.readFileSync(runnerPid, "utf8"));
      expect(alive(pid)).toBe(true);
      parent.kill("SIGKILL");
      expect(await until(() => !alive(pid) && !fs.existsSync(cleanupDir), 10_000)).toBe(true);
    } finally {
      if (parent.exitCode === null) parent.kill("SIGKILL");
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("removes compare's directories when compare is killed between the runs", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-guardian-"));
    const owned = path.join(dir, "vn-compare-x");
    fs.mkdirSync(path.join(owned, "deep"), { recursive: true });
    const guardianFile = path.join(dir, "guardian.js");
    fs.writeFileSync(guardianFile, GUARDIAN);
    const ready = path.join(dir, "ready");
    // A stand-in for compare between its runs: only the guardian is alive beside it.
    const parent = spawn(
      process.execPath,
      [
        "-e",
        `const { spawn } = require("node:child_process");
         const fs = require("node:fs");
         const [file, owned, ready] = process.argv.slice(1);
         spawn(process.execPath, ["-e", fs.readFileSync(file, "utf8"), "--", JSON.stringify([owned]), "[]"],
           { stdio: ["ignore", "ignore", "ignore", "ipc"], detached: true });
         fs.writeFileSync(ready, "");
         setInterval(() => {}, 1000);`,
        "--",
        guardianFile,
        owned,
        ready,
      ],
      { stdio: "ignore" },
    );
    try {
      expect(await until(() => fs.existsSync(ready), 10_000)).toBe(true);
      parent.kill("SIGKILL");
      expect(await until(() => !fs.existsSync(owned), 10_000)).toBe(true);
    } finally {
      if (parent.exitCode === null) parent.kill("SIGKILL");
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("stops the runner and cleans up on SIGHUP, exiting 130", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/hang.check.js": `test("hangs", () => new Promise(() => {}), 600_000);\n`,
      },
    });
    const jest = jestReport(root, { "src/hang.check.js": [{ title: "hangs" }] });
    const pending = runCli(["--root", root, "--jest-results", jest]);
    await new Promise((r) => setTimeout(r, 3000));
    process.emit("SIGHUP", "SIGHUP");
    const { code, text } = await pending;
    expect(code, text).toBe(130);
    expect(text).toContain("Vitest was interrupted.");
    expect(fs.existsSync(path.join(root, "node_modules", ".vitest-native"))).toBe(false);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 7–8. Titles, foreign roots, small things
// ---------------------------------------------------------------------------

/**
 * A stand-in Jest package: it writes the --json report VN_FAKE_JEST_REPORT names and its
 * arguments to VN_FAKE_JEST_ARGS, and, like jest-junit, rewrites the project's tracked
 * junit.xml whenever the configured reporters run.
 */
function makeFakeJest(): string {
  const fakeJest = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-fake-jest-"));
  fs.writeFileSync(
    path.join(fakeJest, "package.json"),
    JSON.stringify({ name: "jest", version: "30.0.0", bin: { jest: "bin.js" } }),
  );
  fs.writeFileSync(
    path.join(fakeJest, "bin.js"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith("--outputFile=")).slice("--outputFile=".length);
fs.writeFileSync(process.env.VN_FAKE_JEST_ARGS, JSON.stringify(args));
if (!args.includes("--reporters=default")) {
  fs.writeFileSync(path.join(process.cwd(), "junit.xml"), '<testsuites tests="1"/>');
}
fs.copyFileSync(process.env.VN_FAKE_JEST_REPORT, out);
`,
    { mode: 0o755 },
  );
  return fakeJest;
}

describe("compare: the Jest run", () => {
  it("runs only Jest's default reporter, so a configured reporter cannot write into the project", async () => {
    const fakeJest = makeFakeJest();
    const root = scratchProject({
      jestDir: fakeJest,
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/a.check.js": `test("adds", () => {});\n`,
        "junit.xml": "<testsuites/>\n",
      },
    });
    const prepared = jestReport(root, { "src/a.check.js": [{ title: "adds" }] });
    const previous = process.env.VN_FAKE_JEST_REPORT;
    process.env.VN_FAKE_JEST_REPORT = prepared;
    const argsFile = path.join(fakeJest, "args.json");
    process.env.VN_FAKE_JEST_ARGS = argsFile;
    try {
      const { code, text } = await runCli(["--root", root]);
      expect(text).not.toContain("changed junit.xml");
      expect(fs.readFileSync(path.join(root, "junit.xml"), "utf8")).toBe("<testsuites/>\n");
      expect(code).toBe(0);
      // Declaration order whatever the config says (Jest 29.2+), so %p rows pair by place.
      const args = JSON.parse(fs.readFileSync(argsFile, "utf8")) as string[];
      expect(args).toContain("--randomize=false");
      expect(args).toContain("--reporters=default");
      expect(args.at(-1)).toBe("--ci");
    } finally {
      if (previous === undefined) delete process.env.VN_FAKE_JEST_REPORT;
      else process.env.VN_FAKE_JEST_REPORT = previous;
      delete process.env.VN_FAKE_JEST_ARGS;
    }
  }, 120_000);

  it("confirms %p rows by position on a run it started, and lists them for review with --strict", async () => {
    const fakeJest = makeFakeJest();
    const root = scratchProject({
      jestDir: fakeJest,
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/rows.check.js": `test.each([[1], [2], [3]])("loads %p", () => {});\n`,
      },
    });
    process.env.VN_FAKE_JEST_REPORT = jestReport(root, {
      "src/rows.check.js": [{ title: "loads 1" }, { title: "loads 2" }, { title: "loads 3" }],
    });
    process.env.VN_FAKE_JEST_ARGS = path.join(fakeJest, "args.json");
    try {
      const byPosition = await runCli(["--root", root]);
      expect(byPosition.code).toBe(0);
      expect(byPosition.text).toContain("! 3 tests confirmed by row position only");
      const strict = await runCli(["--root", root, "--strict"]);
      expect(strict.code).toBe(1);
      expect(strict.text).toContain("3 matched only by title shape");
      expect(strict.text).not.toContain("confirmed by row position only");
    } finally {
      delete process.env.VN_FAKE_JEST_REPORT;
      delete process.env.VN_FAKE_JEST_ARGS;
    }
  }, 180_000);
});

describe("compare: matching", () => {
  it("blocks the claim on tests matched only by title shape, and maps %p rows one to one", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/obj.check.js": `describe("access", () => { test.each([{ user: { role: "guest" } }])("allows %s", () => {}); });\n`,
        "src/var.check.js": `describe("parser", () => { test("returns undefined for 1", () => {}); });\n`,
        "src/rows.check.js": `test.each([[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]])("loads %p", () => {});\n`,
      },
    });
    // Jest 30's titles for its own rows: an admin, $output missing, and %p printed.
    const jest = jestReport(root, {
      "src/obj.check.js": [{ ancestors: ["access"], title: "allows { user: [Object] }" }],
      "src/var.check.js": [{ ancestors: ["parser"], title: "returns $output for 1" }],
      "src/rows.check.js": [
        { title: 'loads {"id": 1}' },
        { title: 'loads {"id": 2}' },
        { title: 'loads {"id": 3}' },
      ],
    });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code).toBe(1);
    // A --jest-results report comes from a run compare did not start, so its order is not
    // known: the %p rows are listed for review too (confirmed in order: the classify tests).
    expect(text).toContain("5 of the 5 tests that pass under Jest do not pass under Vitest");
    expect(text).toContain("5 matched only by title shape");
    expect(text).toContain("✗ 5 tests could only be matched by title shape; check them");
    expect(text).toContain("allows { user: [Object] }  ~  allows { user: { role: 'guest' } }");
    expect(text).toContain('loads {"id": 3}  ~  loads %p');
    // Every %p row is matched, none is left "not collected".
    const headline = text.split("\n").find((l) => l.includes("do not pass under Vitest")) ?? "";
    expect(headline).not.toContain("not collected");
    expect(text).toMatch(/only under Vitest\s+0 /);
  }, 120_000);

  it("compares full titles: Vitest's 40-character cut of a formatted value is turned off", async () => {
    const long = "You joined Bluesky using a Starter Pack just now";
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        // Object rows with $-keys: the format whose string values Vitest cuts at 40.
        "src/long.check.js": `test.each(${JSON.stringify([{ m: long }, { m: long.replace("just now", "5 seconds ago") }])})("$m", () => {});\n`,
      },
    });
    const jest = jestReport(root, {
      "src/long.check.js": [{ title: long }, { title: long.replace("just now", "5 seconds ago") }],
    });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(text).not.toContain("Starter Pack…");
    expect(text).not.toContain("named differently");
    expect(code).toBe(0);
  }, 120_000);

  it("never confirms a Jest test by an unrelated Vitest test at its place", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/should.check.js": `test("should render the footer", () => {});\ntest("anchor", () => {});\n`,
        "src/rows.check.js":
          `describe("native modules", () => {\n` +
          `  test.each(["Camera", "WebView"])("module %s is linked", (m) => { expect(m).toBeTruthy(); });\n});\n`,
      },
    });
    const jest = jestReport(root, {
      "src/should.check.js": [
        { title: "should charge the card when the order is placed" },
        { title: "anchor" },
      ],
      "src/rows.check.js": [
        { ancestors: ["native modules"], title: "module Camera is linked" },
        { ancestors: ["native modules"], title: "module Bluetooth is linked" },
      ],
    });
    const { code, text } = await runCli(["--root", root, "--jest-results", jest]);
    expect(code).toBe(1);
    expect(text).toContain("2 of the 4 tests that pass under Jest do not pass under Vitest");
    expect(text).toContain("2 named differently");
    expect(text).toContain(
      "should charge the card when the order is placed  ≠  should render the footer",
    );
    expect(text).toContain("module Bluetooth is linked  ≠  module WebView is linked");
    expect(text).not.toContain("⇄");
  }, 120_000);

  it("reads a Jest report made in CI, at another root", async () => {
    const root = scratchProject({
      files: { "vitest.config.mjs": VITEST_CONFIG, "src/a.check.js": `test("t", () => {});\n` },
    });
    const ci = path.join(path.sep, "home", "runner", "work", "app");
    const jest = jestReport(root, { "src/a.check.js": [{ title: "t" }] }, ci);
    const detected = await runCli(["--root", root, "--jest-results", jest]);
    expect(detected.text).toContain(`Jest's report was made at ${ci.split(path.sep).join("/")}`);
    expect(detected.text).toContain("All 1 test that pass under Jest also pass under Vitest");
    const explicit = await runCli(["--root", root, "--jest-results", jest, "--jest-root", ci]);
    expect(explicit.text).toContain("All 1 test that pass under Jest also pass under Vitest");
  }, 120_000);
});
