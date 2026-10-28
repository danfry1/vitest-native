/**
 * `vitest-native compare`: the cases an adversarial review of the first version found,
 * each executed. The end-to-end cases run Vitest for real on a scratch project, with a
 * Jest report written for it (tests/support/compare-helpers.ts); the Jest side of each
 * is the plain result Jest 30 gives those files (all passing unless noted).
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classify,
  normaliseReport,
  renderComparison,
  sameTemplate,
  sanitizeMessage,
  type NormaliseContext,
} from "../src/cli/compare.js";
import {
  forwardedScriptFlags,
  importSpecifier,
  parseCompareArgs,
  vitestOutputReader,
  WATCHDOG,
} from "../src/cli/compare-run.js";
import { jestReport, runCli, scratchProject, treeBytes } from "./support/compare-helpers.js";

const ctx: NormaliseContext = { root: "/project", realpath: (p) => p, home: "/home/user", tmp: [] };
const posix = process.platform !== "win32";

const report = (files: Record<string, Array<[string, string]>>) => ({
  testResults: Object.entries(files).map(([name, tests]) => ({
    name: `/project/${name}`,
    status: tests.some(([, s]) => s === "failed") ? "failed" : "passed",
    message: "",
    assertionResults: tests.map(([title, status]) => ({
      ancestorTitles: [],
      title,
      status,
      failureMessages: status === "failed" ? ["Error: no"] : [],
    })),
  })),
});

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
    expect(text).toContain("✗ All 1 test that pass under Jest also pass under Vitest");
    expect(text).toContain("✗ `vitest run` exits 1:");
    expect(text).toContain("Unhandled Rejection: Error: unhandled under vitest");
    expect(text).not.toMatch(/^✓/m);
  }, 120_000);

  it("fails on process.exit in a test file and on a globalSetup teardown that throws", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { globals: true, include: ["**/*.check.js"], globalSetup: ["./gs.mjs"] } };\n`,
        "gs.mjs": `export default () => () => { throw new Error("globalTeardown failed"); };\n`,
        "src/exit.check.js": `test("b", () => {});\nafterAll(() => { setTimeout(() => process.exit(0), 0); });\n`,
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

  it("never pairs copies by order: concurrent duplicates with opposite outcomes fail in both", () => {
    // Jest ran the copies in one order, Vitest in the other (test.concurrent, randomize).
    const c = classify(
      normaliseReport(
        report({
          "a.test.js": [
            ["handles a row", "passed"],
            ["handles a row", "failed"],
          ],
        }),
        "jest",
        ctx,
      ),
      normaliseReport(
        report({
          "a.test.js": [
            ["handles a row", "failed"],
            ["handles a row", "passed"],
          ],
        }),
        "vitest",
        ctx,
      ),
    );
    expect(c.entries.map((e) => e.bucket)).toEqual(["same-fail"]);
    expect(c.claimHolds).toBe(false);
  });

  it("reads Jest projects' copies of a file as one test reported twice", () => {
    const jest = normaliseReport(
      {
        testResults: ["ios", "android"].map(() => ({
          name: "/project/src/plat.check.js",
          status: "passed",
          message: "",
          assertionResults: [{ ancestorTitles: [], title: "t", status: "passed" }],
        })),
      },
      "jest",
      ctx,
    );
    const c = classify(
      jest,
      normaliseReport(report({ "src/plat.check.js": [["t", "passed"]] }), "vitest", ctx),
      {
        vitestRun: { exitCode: 0, errors: [], engine: "native" },
      },
    );
    expect(c.entries).toHaveLength(1);
    expect(c.entries[0]).toMatchObject({ bucket: "same-pass", jest: { copies: 2 } });
    expect(c.claimHolds).toBe(true);
  });

  it("names the engine, or says that no vitest-native engine ran", () => {
    const passing = () => normaliseReport(report({ "a.test.js": [["t", "passed"]] }), "jest", ctx);
    const render = (engine: string | null) =>
      renderComparison(
        classify(
          passing(),
          normaliseReport(report({ "a.test.js": [["t", "passed"]] }), "vitest", ctx),
          {
            vitestRun: { exitCode: 0, errors: [], engine },
          },
        ),
        { jest: { version: "30", config: "x" }, vitest: { version: "5", config: "y" }, top: 5 },
      ).join("\n");
    expect(render("native")).toContain(
      "✓ All 1 test that pass under Jest also pass under Vitest (engine: native), and `vitest run` exits 0.",
    );
    expect(render(null)).toContain("no vitest-native engine reported");
  });

  it("reads unhandled errors, errors during close and the engine from Vitest's output", () => {
    const reader = vitestOutputReader((s) => s);
    for (const line of [
      "[vitest-native] engine: native — real React Native",
      "⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯",
      "Error: boom",
      "\u001b[31m⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯\u001b[39m",
      "",
      "Error: process.exit unexpectedly called",
      "error during close Error: teardown",
    ]) {
      reader.onLine(line);
    }
    expect(reader.engine()).toBe("native");
    expect(reader.errors).toEqual([
      "Unhandled Rejection: Error: boom",
      "Uncaught Exception: Error: process.exit unexpectedly called",
      "error during close: Error: teardown",
    ]);
  });
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
      b: "shared-snapshot-dir",
      plain: "shared-snapshot-dir",
      "inline new": undefined,
      "file snapshot": undefined,
    });
    expect(text).toContain("your Vitest config resolves snapshots to Jest's .snap files");
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

  it("fails the run, listing the file, when a test writes into the project", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": VITEST_CONFIG,
        "src/w.check.js": `test("writes", () => { if (typeof vi !== "undefined") require("node:fs").writeFileSync(__dirname + "/out.txt", "x"); });\n`,
      },
    });
    const jest = jestReport(root, { "src/w.check.js": [{ title: "writes" }] });
    const out = path.join(path.dirname(root), `${path.basename(root)}-report.json`);
    const { code, text } = await runCli(["--root", root, "--jest-results", jest, "--json", out]);
    expect(code).toBe(2);
    expect(text).toContain(
      "✗ The runs changed 1 file(s) in the project, which compare must never do:",
    );
    expect(text).toContain("added src/out.txt");
    expect(JSON.parse(fs.readFileSync(out, "utf8")).projectChanges).toEqual(["added src/out.txt"]);
  }, 120_000);

  it("refuses runner arguments outside the allow-list, short-flag clusters included", () => {
    for (const bad of [
      ["--vitest-args", "-ut ."],
      ["--vitest-args", "-u"],
      ["--vitest-args", "--update=new"],
      ["--vitest-args", "--reporter=dot"],
      ["--vitest-args", "--config x"],
      ["--jest-args", "--ci false"],
      ["--jest-args", "--ci=false"],
      ["--jest-args", "-ui"],
      ["--jest-args", "--updateSnapshot"],
      ["--jest-args", "--watchAll"],
      ["--jest-args", "--json"],
    ]) {
      expect(parseCompareArgs(bad), bad.join(" ")).toHaveProperty("error");
    }
    for (const good of [
      ["--jest-args", "--watchAll=false --maxWorkers 2 -i src/a"],
      ["--jest-args", "-t 'adds one' --selectProjects ios"],
      ["--vitest-args", "--no-watch --project ios -t name --shard 1/2 src/"],
      ["--vitest-args", "--no-file-parallelism"],
    ]) {
      expect(parseCompareArgs(good), good.join(" ")).not.toHaveProperty("error");
    }
  });

  it("forwards the test script's flags migrate maps, --silent included", () => {
    const root = scratchProject({
      files: {
        "package.json": JSON.stringify({
          scripts: { test: "jest --maxWorkers=2 --silent --verbose" },
        }),
      },
    });
    expect(forwardedScriptFlags(root)).toEqual({
      forwarded: ["--maxWorkers=2", "--silent"],
      ignored: ["--verbose"],
    });
  });
});

// ---------------------------------------------------------------------------
// 4. The report
// ---------------------------------------------------------------------------

describe("compare: the report carries no source or absolute path", () => {
  const s = (raw: string) =>
    sanitizeMessage(raw, {
      roots: ["/work/app", "C:\\work\\app"],
      tmp: ["/var/folders/T"],
      home: "/Users/me",
    });

  it("drops Vite 8 / oxc code frames", () => {
    const oxc =
      "Transform failed with 1 error:\n\n[PARSE_ERROR] Unexpected token\n   ╭─[ src/syntax.check.ts:2:34 ]\n   │\n" +
      ' 2 │ test("broken", () => { const x = = 1; expect(internalApiKey).toBe(x); });\n' +
      "   │                                  ┬  \n   │                                  ╰── \n───╯";
    expect(s(oxc)).toBe("Transform failed with 1 error:\n\n[PARSE_ERROR] Unexpected token");
  });

  it("drops Node's file:line + source + ^^^ blocks (Jest's Details:)", () => {
    const details =
      "Jest encountered an unexpected token\n\n    Details:\n\n    /work/app/node_modules/esm-pkg/index.js:2\n" +
      "    export const value = SECRET_TOKEN;\n    ^^^^^^\n\n    SyntaxError: Unexpected token 'export'";
    const text = s(details);
    expect(text).not.toContain("SECRET_TOKEN");
    expect(text).toContain("SyntaxError: Unexpected token 'export'");
  });

  it("replaces the temporary directory, other absolute paths, and escaped or lowercase Windows spellings", () => {
    expect(s("cannot open /var/folders/T/x.json and /Users/someoneelse/secret.txt")).toBe(
      "cannot open <tmp>/x.json and <path>",
    );
    expect(s('{"file":"C:\\\\work\\\\app\\\\src\\\\a.js","other":"D:\\\\Users\\\\x\\\\y"}')).toBe(
      '{"file":"<root>\\\\src\\\\a.js","other":"<path>"}',
    );
    expect(s("at c:/work/app/src/a.js and file:///Users/other/z")).toBe(
      "at <root>/src/a.js and <path>",
    );
    // URLs and regex literals are not paths.
    expect(s("see https://jestjs.io/docs/configuration and /^foo$/")).toBe(
      "see https://jestjs.io/docs/configuration and /^foo$/",
    );
  });

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

describe("compare: matching", () => {
  it("matches parametrised titles that share their template, and nothing else", () => {
    expect(sameTemplate('obj-p {"a": 1}', "obj-p %p")).toBe(true);
    expect(sameTemplate("dollar-missing $nope", "dollar-missing undefined")).toBe(true);
    expect(sameTemplate("renders a card", "submits the form")).toBe(false);
  });

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

  it("imports a config on another Windows drive by its absolute path", () => {
    expect(
      importSpecifier(
        "C:\\p\\node_modules\\.vitest-native\\c",
        "D:\\other\\vitest.config.ts",
        path.win32,
      ),
    ).toBe("D:/other/vitest.config.ts");
    expect(importSpecifier("C:\\p\\node_modules\\x", "C:\\p\\vitest.config.ts", path.win32)).toBe(
      "../../vitest.config.ts",
    );
  });
});
