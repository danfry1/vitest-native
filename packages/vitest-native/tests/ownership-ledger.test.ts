/**
 * The ownership guard's ledger, driven directly (docs/ownership-guard.md). The executed
 * shapes live in ownership-guard-fixtures.test.ts and tests-native/ownership-guard.test.ts;
 * this pins the rules those runs depend on: liveness, exemptions, key spelling, modes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENGINE_RUNTIME_DIR,
  createOwnershipLedger,
  ledgerKey,
  nodeKey,
  parseOwnershipGuardConfig,
  viteMarkerFor,
} from "../src/native/ownership-ledger.mjs";
import {
  OwnershipSummaryReporter,
  ownershipGuardConfig,
  reactNative,
  withOwnershipMarker,
} from "../src/plugin.js";
import { validateOptions } from "../src/validate.js";

const FILE = "/repo/app/src/store.ts";

function ledgerWith(options: Parameters<typeof createOwnershipLedger>[0] = {}) {
  const warnings: string[] = [];
  const ledger = createOwnershipLedger({
    ownerOf: () => ({ owner: "vite", reason: "project-source" }),
    warn: (message) => warnings.push(message),
    ...options,
  });
  return { ledger, warnings };
}

describe("the ledger", () => {
  it("reports Node then Vite once per file, naming both sides", () => {
    const { ledger, warnings } = ledgerWith();
    ledger.recordNode(FILE, { via: "cjs", parent: "/repo/app/src/store.test.ts" });
    ledger.recordVite(nodeKey(FILE), FILE);
    ledger.recordVite(nodeKey(FILE), FILE);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`${FILE} was evaluated by both Node and Vite`);
    expect(warnings[0]).toMatch(/first\s+-> Node \(CommonJS\), required by .*store\.test\.ts/);
    expect(warnings[0]).toContain("policy owner -> Vite (project-source)");
    expect(ledger.conflicts.map((c) => [c.first, c.second, c.route])).toEqual([
      ["node", "vite", "require-from-vite"],
      ["node", "vite", "require-from-vite"],
    ]);
  });

  it("reports Vite then Node, and classifies the route from the requiring parent", () => {
    const { ledger } = ledgerWith();
    ledger.recordNode("/repo/packages/feature/src/index.ts", { via: "cjs" });
    ledger.recordVite(nodeKey(FILE), FILE);
    ledger.recordNode(FILE, { via: "cjs", parent: "/repo/packages/feature/src/index.ts" });
    ledger.recordVite("/repo/app/src/other.ts", "/repo/app/src/other.ts");
    ledger.recordNode("/repo/app/src/other.ts", {
      via: "cjs",
      parent: "/repo/node_modules/rn-lib/index.js",
    });
    ledger.recordVite("/repo/app/src/esm.mjs", "/repo/app/src/esm.mjs");
    ledger.recordNode("/repo/app/src/esm.mjs", { via: "esm" });
    ledger.recordVite("/repo/app/src/actual.ts", "/repo/app/src/actual.ts");
    // jest-compat raises a depth counter around its loads; the record carries it.
    ledger.recordNode("/repo/app/src/actual.ts", { via: "cjs", jestRequire: true });
    expect(ledger.conflicts.map((c) => c.route)).toEqual([
      "node-owned-source",
      "installed-package",
      "node-esm",
      "jest-compat",
    ]);
  });

  it("calls any installed file both sides evaluate the inline case, in either order", () => {
    const { ledger } = ledgerWith({
      ownerOf: () => ({ owner: "vitest-default", reason: "delegated" }),
    });
    ledger.recordNode("/repo/node_modules/lib/index.js", { via: "cjs" });
    ledger.recordVite("/repo/node_modules/lib/index.js", "/repo/node_modules/lib/index.js");
    // server.deps.inline gave Vite the package first; an installed package requires it.
    ledger.recordVite("/repo/node_modules/pure/index.js", "/repo/node_modules/pure/index.js");
    ledger.recordNode("/repo/node_modules/pure/index.js", {
      via: "cjs",
      parent: "/repo/node_modules/ext/index.js",
    });
    expect(ledger.conflicts.map((c) => c.route)).toEqual(["vite-inline", "vite-inline"]);
    expect(ledger.conflicts[1].message).toContain("server.deps.inline");
  });

  it("keeps one record per Node module, so a copy restored to the cache is seen again", () => {
    // isolateModules: the outer copy leaves the cache, an inner copy is loaded, and the
    // outer one is put back. One record per PATH lost the outer copy.
    const cache = new Map<string, object>();
    const outer = {};
    const inner = {};
    const { ledger } = ledgerWith({
      nodeLive: (record) => cache.get(FILE) === (record as { module: object }).module,
      collected: () => false,
    });
    cache.set(FILE, outer);
    ledger.recordNode(FILE, { via: "cjs", module: outer } as never);
    cache.delete(FILE);
    cache.set(FILE, inner);
    ledger.recordNode(FILE, { via: "cjs", module: inner } as never);
    cache.set(FILE, outer);
    ledger.recordVite(nodeKey(FILE), FILE);
    expect(ledger.conflicts).toHaveLength(1);
  });

  it("throws in error mode before Node's copy is recorded", () => {
    const { ledger, warnings } = ledgerWith({ mode: "error" });
    ledger.recordVite(nodeKey(FILE), FILE);
    expect(() => ledger.recordNode(FILE, { via: "cjs" })).toThrow(
      expect.objectContaining({ code: "MODULE_DUAL_EVALUATION" }),
    );
    expect(warnings).toEqual([]);
    // Every attempt throws, not only the first: the second copy never gets used.
    expect(() => ledger.recordNode(FILE, { via: "cjs" })).toThrow(/evaluated by both/);
  });

  it("ignores a first copy that is no longer live (hot reset, jest.resetModules)", () => {
    const dead = ledgerWith({ nodeLive: () => false, viteLive: () => false });
    dead.ledger.recordNode(FILE, { via: "cjs" });
    dead.ledger.recordVite(nodeKey(FILE), FILE);
    dead.ledger.recordNode(FILE, { via: "cjs" });
    expect(dead.ledger.conflicts).toEqual([]);
  });

  it("matches a file across Node's and Vite's spellings of one path", () => {
    expect(ledgerKey("d:\\a\\x.ts")).toBe("D:/a/x.ts");
    const { ledger } = ledgerWith();
    ledger.recordNode("D:\\a\\x.ts", { via: "cjs" });
    ledger.recordVite(nodeKey("D:/a/x.ts"), "D:/a/x.ts");
    expect(ledger.conflicts).toHaveLength(1);
  });

  it("exempts the test runtime, the engine, and named allow entries only", () => {
    const { ledger } = ledgerWith({
      allow: [{ path: "/repo/app/src/legacy", reason: "shared constants, no state" }],
    });
    for (const file of [
      "/repo/node_modules/vitest/dist/index.js",
      "/repo/node_modules/chai/index.js",
      path.join(ENGINE_RUNTIME_DIR, "native", "hooks.mjs"),
      "/repo/app/src/legacy/constants.ts",
    ]) {
      ledger.recordNode(file, { via: "cjs" });
      ledger.recordVite(nodeKey(file), file);
    }
    expect(ledger.conflicts).toEqual([]);
    ledger.recordNode("/repo/app/src/legacy-other.ts", { via: "cjs" });
    ledger.recordVite("/repo/app/src/legacy-other.ts", "/repo/app/src/legacy-other.ts");
    expect(ledger.conflicts).toHaveLength(1);
  });
});

describe("the Vite marker", () => {
  let dir = "";
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  it("is written for JS/TS/JSON module ids, query stripped, without touching the disk", () => {
    // Vite's ids are already real paths; the marker keys them as Node keys its files.
    const id = "/Repo/src/A.ts";
    const marker = viteMarkerFor(id);
    expect(marker).toBe(
      `globalThis.__vitest_native_ownership_vite?.(${JSON.stringify(nodeKey(id))}, ${JSON.stringify(id)});`,
    );
    // The same file's code under a query is recorded under the file.
    expect(viteMarkerFor(`${id}?x=1`)).toBe(marker);
    expect(viteMarkerFor("/repo/src/data.json")).not.toBeNull();
    // Queries that serve something other than the module, virtual and relative ids.
    expect(viteMarkerFor(`${id}?raw`)).toBeNull();
    expect(viteMarkerFor(`${id}?url`)).toBeNull();
    expect(viteMarkerFor("\0virtual:x.ts")).toBeNull();
    expect(viteMarkerFor("src/a.ts")).toBeNull();
    expect(viteMarkerFor("/repo/src/a.css")).toBeNull();
  });

  it("folds case only where the file system ignores it", () => {
    const folded = process.platform === "darwin" || process.platform === "win32";
    expect(nodeKey("/Repo/Src/Store.ts")).toBe(
      folded ? "/repo/src/store.ts" : "/Repo/Src/Store.ts",
    );
  });
});

describe("configuration", () => {
  const saved = process.env.VITEST_NATIVE_OWNERSHIP_MODE;
  afterEach(() => {
    if (saved === undefined) delete process.env.VITEST_NATIVE_OWNERSHIP_MODE;
    else process.env.VITEST_NATIVE_OWNERSHIP_MODE = saved;
  });

  it("defaults to warn, and the run-wide override wins over the option", () => {
    delete process.env.VITEST_NATIVE_OWNERSHIP_MODE;
    expect(ownershipGuardConfig(undefined, "/repo").mode).toBe("warn");
    expect(ownershipGuardConfig({ ownership: "error" }, "/repo").mode).toBe("error");
    process.env.VITEST_NATIVE_OWNERSHIP_MODE = "error";
    expect(ownershipGuardConfig({ ownership: "warn" }, "/repo").mode).toBe("error");
    expect(
      ownershipGuardConfig({ ownership: { allow: [{ path: "src/x", reason: "r" }] } }, "/repo"),
    ).toEqual({ mode: "error", allow: [{ path: path.resolve("/repo", "src/x"), reason: "r" }] });
  });

  it("validates the option: modes, and exemptions that carry a reason", () => {
    expect(() => validateOptions({ ownership: "error" })).not.toThrow();
    expect(() =>
      validateOptions({ ownership: { mode: "warn", allow: [{ path: "a", reason: "b" }] } }),
    ).not.toThrow();
    for (const bad of [
      "off",
      { mode: "off" },
      { allow: [{ path: "a" }] },
      { allow: [{ path: "a", reason: " " }] },
      { ignore: true },
    ]) {
      expect(() => validateOptions({ ownership: bad }), JSON.stringify(bad)).toThrow(
        expect.objectContaining({ code: "INVALID_OPTION" }),
      );
    }
  });

  it("reads a malformed worker config as the default rather than failing the run", () => {
    expect(parseOwnershipGuardConfig("not-json")).toEqual({ mode: "warn", allow: [] });
    expect(
      parseOwnershipGuardConfig(
        JSON.stringify({
          mode: "error",
          allow: [
            { path: "/a", reason: "" },
            { path: "/b", reason: "ok" },
          ],
        }),
      ),
    ).toEqual({ mode: "error", allow: [{ path: "/b", reason: "ok" }] });
  });
});

/**
 * The installed ledger, in a plain Node child: the liveness probes and the record's
 * hold on modules are wired there, not in the pure core above.
 */
describe("the installed ledger", () => {
  const ledgerUrl = pathToFileURL(
    path.resolve(import.meta.dirname, "../src/native/ownership-ledger.mjs"),
  ).href;
  let dir = "";
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  function node(script: string, args: string[] = []) {
    const child = spawnSync(process.execPath, [...args, "--input-type=module", "-e", script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, LEDGER: ledgerUrl },
    });
    expect(child.status, child.stderr).toBe(0);
    return child.stdout.trim();
  }

  const prelude = `
    import Module, { createRequire } from "node:module";
    import fs from "node:fs";
    const L = await import(process.env.LEDGER);
    const ledger = L.installOwnershipLedger({ projectRoot: process.cwd() });
    const require = createRequire(process.cwd() + "/x.js");
    const viteEvaluates = (file) => {
      const real = fs.realpathSync(file);
      globalThis[L.VITE_MARKER](L.realKey(real), real);
    };
    console.warn = () => {};
  `;

  it("treats a Node copy as live only while Node's cache holds that module", () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ledger-live-")));
    fs.writeFileSync(path.join(dir, "m.js"), "exports.store = {};\n");
    const out = node(`${prelude}
      const file = fs.realpathSync("m.js");
      require("./m.js");
      delete Module._cache[file];
      viteEvaluates(file);
      const viteSecond = () => ledger.conflicts.filter((c) => c.second === "vite").length;
      const dropped = viteSecond();
      require("./m.js");
      viteEvaluates(file);
      console.log(dropped, viteSecond());
    `);
    // Dropped from the cache (a reset): nothing to report. Loaded again and still held:
    // a live twin, reported.
    expect(out).toBe("0 1");
  });

  it("looks a copy up under the key Node used, with --preserve-symlinks", () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ledger-sym-")));
    fs.mkdirSync(path.join(dir, "real"));
    fs.writeFileSync(path.join(dir, "real", "m.js"), "exports.store = {};\n");
    fs.symlinkSync(path.join(dir, "real"), path.join(dir, "link"), "junction");
    const script = `${prelude}
      require("./link/m.js");
      viteEvaluates("link/m.js");
      console.log(ledger.conflicts.length);
    `;
    expect(node(script)).toBe("1");
    expect(node(script, ["--preserve-symlinks"])).toBe("1");
  });

  it("does not keep a module alive once Node's cache has let it go", () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ledger-mem-")));
    // 100 modules holding 2 MB each: without WeakRefs the ledger kept all 200 MB.
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(
        path.join(dir, `b${i}.js`),
        `exports.big = new Array(${(2 * 1024 * 1024) / 8}).fill(${i}.5);\n`,
      );
    }
    const out = node(
      `${prelude}
      for (let i = 0; i < 100; i++) {
        const file = fs.realpathSync("b" + i + ".js");
        // No parent: a parent's \`children\` would hold the module, ledger or not.
        Module._load(file, null);
        delete Module._cache[file];
      }
      // WeakRef targets stay alive until the current job ends.
      await new Promise((resolve) => setImmediate(resolve));
      globalThis.gc(); globalThis.gc();
      console.log(Math.round(process.memoryUsage().heapUsed / 1e6));
    `,
      ["--expose-gc"],
    );
    expect(Number(out)).toBeLessThan(50);
  });
});

describe("the plugin's side of the guard", () => {
  const SERVE = { command: "serve", mode: "test" };
  const saved = process.env.VITEST_NATIVE_OWNERSHIP_MODE;
  afterEach(() => {
    if (saved === undefined) delete process.env.VITEST_NATIVE_OWNERSHIP_MODE;
    else process.env.VITEST_NATIVE_OWNERSHIP_MODE = saved;
    vi.restoreAllMocks();
  });

  it("rejects a mistyped run-wide override instead of quietly warning", () => {
    process.env.VITEST_NATIVE_OWNERSHIP_MODE = "erorr";
    expect(() => ownershipGuardConfig(undefined, "/repo")).toThrow(
      /VITEST_NATIVE_OWNERSHIP_MODE must be "error" or "warn", not "erorr"/,
    );
  });

  it("refuses an exemption covering the whole project: that is turning the guard off", () => {
    delete process.env.VITEST_NATIVE_OWNERSHIP_MODE;
    for (const where of [".", "..", "/"]) {
      expect(() =>
        ownershipGuardConfig(
          { ownership: { allow: [{ path: where, reason: "everything" }] } },
          process.cwd(),
        ),
      ).toThrow(/covers the whole project/);
    }
    expect(() =>
      ownershipGuardConfig(
        { ownership: { allow: [{ path: "src", reason: "one dir" }] } },
        process.cwd(),
      ),
    ).not.toThrow();
  });

  it("says `ownership` does nothing under the mock engine", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = reactNative({ engine: "mock", ownership: "error" }) as any;
    await plugin.config.handler.call({}, { root: process.cwd() }, SERVE);
    expect(warn.mock.calls.map(([m]) => String(m)).join("\n")).toContain(
      "'ownership' only applies to engine:'native'",
    );
    // And keeps the mock engine's transform (Flow strip) ahead of esbuild.
    expect(plugin.transform.order).toBe("pre");
  });

  it("appends the marker on lines of its own and leaves the map alone", () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ledger-eof-")));
    try {
      const file = path.join(dir, "m.js");
      const code = "export const a = 1 // a trailing comment, no newline";
      fs.writeFileSync(file, code);
      const result = withOwnershipMarker(code, file)!;
      // Every original byte where it was; the marker after a newline, so a trailing
      // line comment cannot swallow it.
      expect(result.code.startsWith(`${code}\n;globalThis.__vitest_native_ownership_vite?.(`)).toBe(
        true,
      );
      expect(result.map).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports each watch-mode run's findings, not every run's so far", () => {
    const written: string[] = [];
    const reporter = new OwnershipSummaryReporter(
      () => [],
      (text) => written.push(text),
    );
    const file = (conflicts: { file: string; second: string; route: string }[]) => ({
      moduleId: "/repo/src/a.test.ts",
      meta: () => ({ vitestNativeOwnership: { mode: "warn", conflicts, allowUsed: [] } }),
    });
    reporter.onTestRunStart();
    reporter.onTestModuleEnd(file([{ file: "/repo/src/store.ts", second: "vite", route: "r" }]));
    reporter.onTestRunEnd();
    expect(written.join("")).toContain("/repo/src/store.ts");
    // Fixed in the next run: nothing to report.
    written.length = 0;
    reporter.onTestRunStart();
    reporter.onTestModuleEnd(file([]));
    reporter.onTestRunEnd();
    expect(written).toEqual([]);
  });
});
