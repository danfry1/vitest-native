/**
 * The ownership guard's ledger, driven directly (docs/ownership-guard.md). The executed
 * shapes live in ownership-guard-fixtures.test.ts and tests-native/ownership-guard.test.ts;
 * this pins the rules those runs depend on: liveness, exemptions, key spelling, modes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENGINE_RUNTIME_DIR,
  createOwnershipLedger,
  ledgerKey,
  parseOwnershipGuardConfig,
  viteMarkerFor,
} from "../src/native/ownership-ledger.mjs";
import { ownershipGuardConfig } from "../src/plugin.js";
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
    ledger.recordVite(ledgerKey(FILE), FILE);
    ledger.recordVite(ledgerKey(FILE), FILE);
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
    ledger.recordVite(ledgerKey(FILE), FILE);
    ledger.recordNode(FILE, { via: "cjs", parent: "/repo/packages/feature/src/index.ts" });
    ledger.recordVite("/repo/app/src/other.ts", "/repo/app/src/other.ts");
    ledger.recordNode("/repo/app/src/other.ts", {
      via: "cjs",
      parent: "/repo/node_modules/rn-lib/index.js",
    });
    ledger.recordVite("/repo/app/src/esm.mjs", "/repo/app/src/esm.mjs");
    ledger.recordNode("/repo/app/src/esm.mjs", { via: "esm" });
    ledger.recordVite("/repo/app/src/actual.ts", "/repo/app/src/actual.ts");
    ledger.recordNode("/repo/app/src/actual.ts", {
      via: "cjs",
      stack: "Error\n    at vi.requireActual (/x/setup.mjs:1:1)",
    });
    expect(ledger.conflicts.map((c) => c.route)).toEqual([
      "node-owned-source",
      "installed-package",
      "node-esm",
      "jest-compat",
    ]);
  });

  it("says a Vite evaluation of a Node-owned or installed file is the inline case", () => {
    const { ledger } = ledgerWith({
      ownerOf: () => ({ owner: "node", reason: "ecosystem-detected" }),
    });
    ledger.recordNode("/repo/node_modules/lib/index.js", { via: "cjs" });
    ledger.recordVite("/repo/node_modules/lib/index.js", "/repo/node_modules/lib/index.js");
    expect(ledger.conflicts[0]).toMatchObject({ route: "vite-inline", owner: "node" });
  });

  it("throws in error mode before Node's copy is recorded", () => {
    const { ledger, warnings } = ledgerWith({ mode: "error" });
    ledger.recordVite(ledgerKey(FILE), FILE);
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
    dead.ledger.recordVite(ledgerKey(FILE), FILE);
    dead.ledger.recordNode(FILE, { via: "cjs" });
    expect(dead.ledger.conflicts).toEqual([]);
  });

  it("matches a file across Node's and Vite's spellings of one path", () => {
    expect(ledgerKey("d:\\a\\x.ts")).toBe("D:/a/x.ts");
    const { ledger } = ledgerWith();
    ledger.recordNode("D:\\a\\x.ts", { via: "cjs" });
    ledger.recordVite(ledgerKey("D:/a/x.ts"), "D:/a/x.ts");
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
      ledger.recordVite(ledgerKey(file), file);
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

  it("is appended only to real JS/TS modules, keyed by real path", () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ledger-marker-")));
    fs.mkdirSync(path.join(dir, "real"));
    fs.writeFileSync(path.join(dir, "real", "a.ts"), "export {};\n");
    fs.symlinkSync(path.join(dir, "real"), path.join(dir, "link"), "junction");
    const marker = viteMarkerFor(path.join(dir, "link", "a.ts"));
    expect(marker).toContain(JSON.stringify(ledgerKey(path.join(dir, "real", "a.ts"))));
    expect(marker).toMatch(/^\n;globalThis\.__vitest_native_ownership_vite\?\.\(/);
    expect(viteMarkerFor(`${path.join(dir, "real", "a.ts")}?raw`)).toBeNull();
    expect(viteMarkerFor("\0virtual:x.ts")).toBeNull();
    expect(viteMarkerFor(path.join(dir, "real", "data.json"))).toBeNull();
    expect(viteMarkerFor(path.join(dir, "real", "missing.ts"))).toBeNull();
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
