/**
 * `vitest-native compare`: the cases an adversarial review of the first version found
 * that need no runner. The ones that run Vitest are in cli-compare-edges.e2e.test.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classify,
  normaliseReport,
  renderComparison,
  titleMatch,
  sanitizeMessage,
  unconfirmed,
  type NormaliseContext,
} from "../src/cli/compare.js";
import {
  forwardedScriptFlags,
  importSpecifier,
  jestRandomizeFlag,
  parseCompareArgs,
  outputLines,
  vitestOutputReader,
  treeState,
  unreadablePaths,
} from "../src/cli/compare-run.js";
import { scratchProject } from "./support/compare-helpers.js";

const ctx: NormaliseContext = { root: "/project", realpath: (p) => p, home: "/home/user", tmp: [] };
const RENDER = {
  jest: { version: "30", config: "x" },
  vitest: { version: "5", config: "y" },
  top: 5,
};

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

// ---------------------------------------------------------------------------
// 1. `vitest run` must exit 0, and every copy of a test must pass
// ---------------------------------------------------------------------------

describe("compare: the verdict includes `vitest run`'s exit code", () => {
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

  it("does not confirm a test Vitest ran fewer times than Jest (a Jest project dropped)", () => {
    const copies = (n: number) =>
      Array.from({ length: n }, () => ({
        name: "/project/src/plat.check.js",
        status: "passed",
        message: "",
        assertionResults: [{ ancestorTitles: [], title: "t", status: "passed" }],
      }));
    const run = { vitestRun: { exitCode: 0, errors: [], engine: "native" } };
    // Jest projects ios + android; Vitest runs one platform.
    const dropped = classify(
      normaliseReport({ testResults: copies(2) }, "jest", ctx),
      normaliseReport({ testResults: copies(1) }, "vitest", ctx),
      run,
    );
    expect(dropped.entries).toHaveLength(1);
    expect(dropped.entries[0]).toMatchObject({ bucket: "same-pass", jest: { copies: 2 } });
    expect(dropped.claimHolds).toBe(false);
    expect(unconfirmed(dropped).fewer).toHaveLength(1);
    const text = renderComparison(dropped, {
      jest: { version: "30", config: "x" },
      vitest: { version: "5", config: "y" },
      top: 5,
    }).join("\n");
    expect(text).toContain("1 run fewer times (a Jest project missing)");
    // Both platforms under Vitest too: confirmed.
    const both = classify(
      normaliseReport({ testResults: copies(2) }, "jest", ctx),
      normaliseReport({ testResults: copies(2) }, "vitest", ctx),
      run,
    );
    expect(both.claimHolds).toBe(true);
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
    // A test printing the banner after Vitest's RUN header cannot set the engine.
    const spoofed = vitestOutputReader((s) => s);
    for (const line of [" RUN  v5.0.5 /x", "[vitest-native] engine: native — real react-native"])
      spoofed.onLine(line);
    expect(spoofed.engine()).toBeNull();
    expect(reader.errors).toEqual([
      "Unhandled Rejection: Error: boom",
      "Uncaught Exception: Error: process.exit unexpectedly called",
      "error during close: Error: teardown",
    ]);
  });

  it("reads an error whose header the pipes split and interleave with the other stream", () => {
    const reader = vitestOutputReader((s) => s);
    const lines = outputLines(reader.onLine);
    const header = Buffer.from("⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯\n");
    // Split inside the three-byte "⎯" next to the label, with stdout output landing before
    // the rest of the line, and again between the header and its message.
    lines.push("stderr", header.subarray(0, 10));
    lines.push("stdout", Buffer.from(" Test Files  1 passed (1)\n      Tests  "));
    lines.push("stderr", header.subarray(10, 16));
    lines.push("stdout", Buffer.from("1 passed (1)\n"));
    lines.push("stderr", header.subarray(16));
    lines.push("stdout", Buffer.from("   Start at  15:09:21\n"));
    lines.push(
      "stderr",
      Buffer.from('Error: process.exit unexpectedly called with "0"\nerror during close Error: x'),
    );
    lines.flush();
    expect(reader.errors).toEqual([
      'Uncaught Exception: Error: process.exit unexpectedly called with "0"',
      "error during close: Error: x",
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
      ["--jest-args", "--coverage"],
      ["--jest-args", "--coverage false"],
      ["--vitest-args", "--coverage.enabled"],
      ["--vitest-args", "--coverage.enabled=true"],
    ]) {
      expect(parseCompareArgs(bad), bad.join(" ")).toHaveProperty("error");
    }
    for (const good of [
      ["--jest-args", "--watchAll=false --maxWorkers 2 -i src/a"],
      ["--jest-args", "-t 'adds one' --selectProjects ios"],
      ["--vitest-args", "--no-watch --project ios -t name --shard 1/2 src/"],
      ["--vitest-args", "--no-file-parallelism"],
      ["--jest-args", "--config jest.ci.config.js --no-watchman --verbose --bail --coverage=false"],
      ["--jest-args", "--bail=2 -c jest.config.js"],
      [
        "--vitest-args",
        "--root packages/app --coverage.enabled=false --bail 1 --allowOnly --sequence.shuffle",
      ],
    ]) {
      expect(parseCompareArgs(good), good.join(" ")).not.toHaveProperty("error");
    }
  });

  it("refuses an unknown option instead of ignoring it", () => {
    const parsed = parseCompareArgs(["--stirct"]);
    expect(parsed).toEqual({
      error: expect.stringContaining("unknown option --stirct for compare"),
    });
    expect((parsed as { error: string }).error).toContain("--strict");
    expect(parseCompareArgs(["--strict", "--jest-args", "--runInBand"])).toMatchObject({
      strict: true,
      jestArgs: ["--runInBand"],
    });
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

  it("says when package.json cannot be read, instead of forwarding nothing silently", () => {
    const root = scratchProject({ files: { "package.json": "{ not json" } });
    const flags = forwardedScriptFlags(root);
    expect(flags.forwarded).toEqual([]);
    expect(flags.unreadable).toMatch(/JSON/);
    const none = scratchProject({});
    fs.rmSync(path.join(none, "package.json"));
    expect(forwardedScriptFlags(none)).toEqual({ forwarded: [], ignored: [] });
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

  it("drops TypeScript diagnostics, esbuild/Hermes excerpts, tab-indented carets and React component stacks", () => {
    expect(
      s(
        `src/a.test.ts:2:7 - error TS2322: Type 'string' is not assignable to type 'number'.\n\n2 const apiKey: number = "sk-live-TS";\n        ~~~~~~`,
      ),
    ).toBe("src/a.test.ts:2:7 - error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(s("x.js:2:10: error: ';' expected\nconst hermesSecret = = 1\n         ^")).toBe(
      "x.js:2:10: error: ';' expected",
    );
    expect(s("SyntaxError: Unexpected token\n\n  const leaked = 'tab-indented frame';\n\t^")).toBe(
      "SyntaxError: Unexpected token",
    );
    expect(
      s(
        "Error: boom\n\nThe above error occurred in the <SecretVault> component:\n\n    in SecretVault (at vault.js:3)\n    in App",
      ),
    ).toBe("Error: boom\n\nThe above error occurred in the <SecretVault> component:");
  });

  it("replaces CI and container checkouts and deep home paths that do not exist here", () => {
    for (const [raw, clean] of [
      [
        "Error: read /mnt/c/Users/jdoe/proj/a.ts and /root/.config/gh/hosts.yml",
        "Error: read <path> and <path>",
      ],
      ["Error: open C:/Users/Bob Smith/work/x.ts failed", "Error: open <path> failed"],
      ["Error: failed at /app/src/billing/stripe-keys.json", "Error: failed at <path>"],
      [
        "Error: ENOENT '/github/workspace/apps/internal-payroll/src/env.ts'",
        "Error: ENOENT '<path>'",
      ],
      ["from '/builds/acme-corp/secret-project/src/app.ts'", "from '<path>'"],
      ["scandir '/home/alice/clients/initech-merger/assets'", "scandir '<path>'"],
      [
        "at /__w/app/app/src/a.ts and /runner/_work/x and /workspace/repo/y",
        "at <path> and <path> and <path>",
      ],
      [
        "at /opt/build/repo/src/a.ts and /buildkite/builds/agent/org/pipe/a.ts",
        "at <path> and <path>",
      ],
    ]) {
      expect(s(raw), raw).toBe(clean);
    }
  });

  it("keeps routes in assertion values, and replaces a home directory's user anywhere else", () => {
    expect(s("Error: cannot open /home/alice/initech-merger")).toBe(
      "Error: cannot open /home/<user>/initech-merger",
    );
    const routes =
      'Expected: "/workspace/42/members"\nReceived: "/app/settings/privacy"\n' +
      'Expected: "/home/profile/edit/photo"\n-   "path": "/home/alice/initech-merger",';
    expect(s(routes)).toBe(routes);
    // In assertion values, a span is replaced when it names a file, exists on disk, or
    // begins with a root no route begins with.
    expect(
      s(
        'Expected: "/github/workspace/apps/env.ts"\n+   "path": "/Users/bob/app/x",\nReceived: "/var/folders/T/x"',
      ),
    ).toBe('Expected: "<path>"\n+   "path": "<path>",\nReceived: "<tmp>/x"');
  });

  it("replaces UNC paths and paths with spaces, and keeps app routes", () => {
    expect(
      s(
        "Error: cannot read \\\\fileserver\\users\\jdoe\\proj\\x.js and \\\\fileserver\\users\\jdoe\\proj",
      ),
    ).toBe("Error: cannot read <path> and <path>");
    expect(s("Error: cannot read /Volumes/Client Work/acme-secret/app.js")).toBe(
      "Error: cannot read <path>",
    );
    expect(s("Error: ENOENT /home/jdoe/.npmrc")).toBe("Error: ENOENT <path>");
    const routes = 'Expected: "/home/profile/edit"\nReceived: "/home/settings/privacy"';
    expect(s(routes)).toBe(routes);
    expect(s("navigated to /settings/privacy/edit")).toBe("navigated to /settings/privacy/edit");
  });
});

// ---------------------------------------------------------------------------
// 7–8. Titles, foreign roots, small things
// ---------------------------------------------------------------------------

describe("compare: Jest's --randomize", () => {
  it("is turned off from Jest 29.2, where the flag exists, and left alone before it", () => {
    expect(jestRandomizeFlag("30.2.0")).toBe(true);
    expect(jestRandomizeFlag("29.2.1")).toBe(true);
    expect(jestRandomizeFlag("29.1.9")).toBe(false);
    expect(jestRandomizeFlag("28.1.3")).toBe(false);
    expect(jestRandomizeFlag(null)).toBe(false);
  });
});

describe("compare: matching", () => {
  it("confirms a pair only when the titles are the same; a shape match is for review", () => {
    // The same title, up to quote style, whitespace runs and a trailing comma inside a
    // printed value.
    for (const [jest, vitest] of [
      ['fetches { id: "1" }', "fetches { id: '1' }"],
      ["obj { a:  1 }", "obj { a: 1 }"],
      ["list [1, 2,]", "list [1, 2]"],
    ]) {
      expect(titleMatch(jest, vitest), `${jest} ⇄ ${vitest}`).toBe("same");
    }
    // Outside printed values nothing is normalised, and inside them only that: these are
    // not the same title (a review's contrived false ✓).
    for (const [jest, vitest] of [
      ["it's on", 'it"s on'],
      ["a , b", "a, b"],
      ["{ x: 1 }", "{x:1}"],
      ["adds  1,  2", "adds 1, 2"],
    ]) {
      expect(titleMatch(jest, vitest), `${jest} ⇄ ${vitest}`).not.toBe("same");
    }
    // Equal only if a printed value is ignored: Jest 30.2 and Vitest 5.0.5's prints of the
    // same rows, and pairs that are different rows (an adversarial review's).
    for (const [jest, vitest] of [
      ["obj-s { a: 1, b: [Array] }", "obj-s { a: 1, b: [ 1, 2 ] }"],
      ['dollar n {"deep": true}', "dollar n { deep: true }"],
      ["dollar-missing $nope", "dollar-missing undefined"],
      ["percent % a", "percent % a undefined"],
      ['tagged 1 {"x": 1}', "tagged 1 { x: 1 }"],
      ["allows { user: [Object] }", "allows { user: { role: 'guest' } }"],
      ["fetches { id: '1' }", "fetches { id: 1 }"],
      ["returns $output for 1", "returns undefined for 1"],
    ]) {
      expect(titleMatch(jest, vitest), `${jest} ⇄ ${vitest}`).toBe("shape");
    }
    // Different only where Vitest left %p unformatted: one or several, with punctuation
    // attached, and printed strings with spaces in them (Bluesky's mention-manip suite).
    // classify confirms these only when the block's rows pair one to one, in order.
    for (const [jest, vitest] of [
      ['obj-p {"a": 1}', "obj-p %p"],
      [
        'given input string "hello @alice goodbye" and cursor position 0, returns undefined',
        "given input string %p and cursor position %p, returns %p",
      ],
      [
        'given input string "hello @alice goodbye" and cursor position 6, returns "alice"',
        "given input string %p and cursor position %p, returns %p",
      ],
      ['escaped "say \\"hi\\" now" ok', "escaped %p ok"],
      ["wraps (1) once", "wraps (%p) once"],
      // Two %p in one token (Bluesky's url-helpers suite).
      [
        'given input uri "foo.example.com", returns "foo.","example.com"',
        "given input uri %p, returns %p,%p",
      ],
      // A printed string with punctuation right after it (Bluesky's url-helpers suite).
      [
        'given input uri "http://example.com" and text "example.com", returns false',
        "given input uri %p and text %p, returns %p",
      ],
    ]) {
      expect(titleMatch(jest, vitest), `${jest} ⇄ ${vitest}`).toBe("placeholder");
    }
    for (const [jest, vitest] of [
      ["should charge the card when the order is placed", "should render the footer"],
      ["module Bluetooth is linked", "module WebView is linked"],
      ['obj {"a": 1}', "obj { a: 2 }"],
      ["renders a card", "renders a card twice"],
      ["value 1", "value undefined"],
      // %p stands for one value, not for the rest of the title.
      ['pretty {"a": 1} on ios', "pretty %p on android"],
      [
        'given input string "hello @alice goodbye" and cursor position 0',
        "given input string %p and cursor %p",
      ],
      // The text between two %p must be there as it is.
      ['returns "a";"b"', "returns %p,%p"],
      // A quote inside ordinary text is not a printed value.
      ['say "hi there to everyone', "say %p to everyone"],
    ]) {
      expect(titleMatch(jest, vitest), `${jest} ⇄ ${vitest}`).toBeNull();
    }
  });

  it("confirms %p rows by position only in declaration order, one to one, and says so", () => {
    const rows = (titles: Array<[string, string]>) => report({ "rows.test.js": titles });
    const vitestRows = rows([
      ["loads %p", "passed"],
      ["loads %p", "passed"],
      ["loads %p", "passed"],
    ]);
    const jestRows = rows([
      ["loads 1", "passed"],
      ["loads 2", "passed"],
      ["loads 3", "passed"],
    ]);
    const run = (j: unknown, v: unknown, ordered?: boolean) =>
      classify(normaliseReport(j, "jest", ctx), normaliseReport(v, "vitest", ctx), {
        ordered,
      });
    // In order, one to one: confirmed, and counted as confirmed by position.
    const ok = run(jestRows, vitestRows);
    expect(ok.confirmed).toBe(3);
    expect(ok.confirmedByPosition).toBe(3);
    expect(ok.entries.every((e) => e.matchedBy === "position")).toBe(true);
    expect(renderComparison(ok, RENDER).join("\n")).toContain(
      "! 3 tests confirmed by row position only",
    );
    // A randomized Jest run, or a report from a run compare did not start: for review only.
    const unordered = run(jestRows, vitestRows, false);
    expect(unordered.confirmed).toBe(0);
    expect(unordered.entries.every((e) => e.matchedBy === "shape")).toBe(true);
    // Jest reported two of the three rows: the places no longer say which row is which.
    const fewer = run(
      rows([
        ["loads 1", "passed"],
        ["loads 2", "passed"],
      ]),
      vitestRows,
    );
    expect(fewer.confirmed).toBe(0);
  });

  it("splits Jest's copies of one printed title into rows, in declaration order", () => {
    // Jest prints rows 1 and 3 as `allows [Object]` (one identity, two copies, not next to
    // each other) after another unmatched test; Vitest prints every row as `%p`. Row 2 fails
    // under Vitest, and the regression must land on Jest's row 2, `allows 3`.
    const jest = report({
      "rows.test.js": [
        ["renders", "passed"],
        ["allows [Object]", "passed"],
        ["allows 3", "passed"],
        ["allows [Object]", "passed"],
      ],
    });
    const vitest = report({
      "rows.test.js": [
        ["renders twice", "passed"],
        ["allows %p", "passed"],
        ["allows %p", "failed"],
        ["allows %p", "passed"],
      ],
    });
    const c = classify(normaliseReport(jest, "jest", ctx), normaliseReport(vitest, "vitest", ctx));
    const allows = c.entries.filter((e) => e.title.startsWith("allows"));
    expect(allows.map((e) => [e.title, e.bucket])).toEqual([
      ["allows [Object]", "same-pass"],
      ["allows 3", "regression"],
      ["allows [Object]", "same-pass"],
    ]);
  });

  it("leaves native build output and coverage out of the tree check", () => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-tree-"));
    for (const f of [
      "src/a.js",
      "ios/Pods/P/x.h",
      "ios/build/b",
      "android/app/build/c",
      "coverage/d",
      ".expo/e",
      // Not at the root: the project's own, checked.
      "src/features/coverage/x.snap",
      "src/.expo/e",
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), "");
    }
    expect([...(treeState(root)?.keys() ?? [])].sort()).toEqual([
      "src/.expo/e",
      "src/a.js",
      "src/features/coverage/x.snap",
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "records a directory it cannot read instead of skipping it, and lists it",
    () => {
      const root = scratchProject({ files: { "src/a.js": "1\n", "locked/b.js": "2\n" } });
      const locked = path.join(root, "locked");
      fs.chmodSync(locked, 0o000);
      try {
        const state = treeState(root);
        expect(state?.get("locked")).toMatch(/^unreadable:EACCES$/);
        expect(unreadablePaths(state ?? new Map())).toEqual(["locked (EACCES)"]);
        expect(state?.has("src/a.js")).toBe(true);
      } finally {
        fs.chmodSync(locked, 0o755);
      }
    },
  );

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
