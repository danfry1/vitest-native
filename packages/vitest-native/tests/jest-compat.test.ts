/**
 * Unit coverage for the shipped jest-compat shims. End-to-end validation (the
 * `@jest/globals` alias + setup wiring against a real jest-coupled suite) lives in
 * the real-app bakeoff; see docs/migrating-from-jest.md.
 */
import { describe, it, expect, vi } from "vitest";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "../src/jest-compat/index.js";

describe("jest-compat: jestMockTransform (hoist + CJS interop)", () => {
  // The plugin's transform hook needs a rollup-style `this.parse`; vitest runs in
  // a Vite pipeline, so reuse the project's installed acorn via a tiny shim.
  const plugin = jestMockTransform();
  // Reuse Vite's parseAst — the same parser rollup's `this.parse` uses in prod.
  const { parseAst } = require("vite");
  const parse = (code: string) => parseAst(code);
  const run = (code: string, id = "/proj/src/foo.test.tsx") => {
    const t = plugin.transform as (this: any, c: string, i: string) => { code: string } | null;
    return t.call({ parse }, code, id);
  };
  const hoistRe = /\b(?:vi|vitest)\s*\.\s*(?:mock|unmock|hoisted|doMock|doUnmock)\s*\(/;

  it("rewrites the jest object of hoistable calls to vi", () => {
    const out = run(["jest.unmock('x');", "jest.doUnmock('z');"].join("\n"));
    expect(out).not.toBeNull();
    const lines = out!.code.split("\n");
    expect(lines[0]).toBe("vi.unmock('x');");
    expect(lines[1]).toBe("vi.doUnmock('z');");
  });

  it("wraps mock/doMock factories with the CJS interop, and matches the hoist regex", () => {
    const out = run("jest.mock('m', () => ({ a: 1 }))");
    expect(hoistRe.test(out!.code)).toBe(true);
    expect(out!.code).toContain("globalThis.__vnInteropMock(");
    // The original factory is preserved inside the wrapper.
    expect(out!.code).toContain("() => ({ a: 1 })");
    expect(out!.code).not.toContain("jest.mock");
  });

  it("wraps a function-returning factory too", () => {
    const out = run("jest.mock('m', () => () => null)");
    expect(out!.code).toContain("globalThis.__vnInteropMock(");
    expect(hoistRe.test(out!.code)).toBe(true);
  });

  it("does NOT wrap unmock/doUnmock (no factory)", () => {
    const out = run("jest.unmock('m')");
    expect(out!.code).not.toContain("__vnInteropMock");
    expect(out!.code).toBe("vi.unmock('m')");
  });

  it("leaves non-hoistable jest.* calls untouched", () => {
    const src =
      "const f = jest.fn(); jest.requireActual('react'); jest.mocked(f); jest.spyOn(o,'m');";
    expect(run(src)).toBeNull();
  });

  it("ignores node_modules and non-source files", () => {
    expect(run("jest.mock('x', () => ({}))", "/proj/node_modules/lib/index.js")).toBeNull();
    expect(run("jest.mock('x', () => ({}))", "/proj/src/data.json")).toBeNull();
  });

  it("returns a sourcemap", () => {
    const out = run("jest.mock('m', () => ({ a: 1 }))") as any;
    expect(out.map).toBeTruthy();
    expect(out.map.mappings).toBeTypeOf("string");
  });
});

describe("jest-compat: jestMockInterop (CJS interop semantics)", () => {
  let jestMockInterop: (m: unknown) => any;
  it("loads the helper", async () => {
    ({ jestMockInterop } = await import("../src/jest-compat/interop.mjs"));
    expect(typeof jestMockInterop).toBe("function");
  });

  it("a named-only object becomes its own default export", () => {
    const exports = { a: 1, b: 2 };
    const ns = jestMockInterop(exports);
    expect(ns.default).toBe(exports); // `import X from` → whole object
    expect(ns.a).toBe(1); // `import { a }` still works
  });

  it("a function factory return is exposed as default", () => {
    const Component = () => null;
    const ns = jestMockInterop(Component);
    expect(ns.default).toBe(Component);
  });

  it("respects an existing __esModule shape", () => {
    const esm = { __esModule: true, default: "d", a: 1 };
    expect(jestMockInterop(esm)).toBe(esm);
  });

  it("respects an explicit default key", () => {
    const m = { default: "d", a: 1 };
    expect(jestMockInterop(m)).toBe(m);
  });

  it("passes null/undefined through", () => {
    expect(jestMockInterop(null)).toBeNull();
    expect(jestMockInterop(undefined)).toBeUndefined();
  });
});

describe("jest-compat: helper", () => {
  it("jestCompatSetup is the setup-file specifier", () => {
    expect(jestCompatSetup).toBe("vitest-native/jest-compat/setup");
  });

  it("jestCompatAliases maps the jest-only modules to vitest-backed shims", () => {
    expect(jestCompatAliases()).toEqual({
      "@jest/globals": "vitest-native/jest-compat/jest-globals",
      "@testing-library/jest-native/extend-expect": "vitest-native/jest-compat/extend-expect-noop",
    });
  });
});

describe("jest-compat: @jest/globals shim", () => {
  it("re-exports vitest globals and maps jest -> vi", async () => {
    const shim = await import("../src/jest-compat/jest-globals.mjs");
    expect(typeof shim.expect).toBe("function");
    expect(typeof shim.describe).toBe("function");
    expect(typeof shim.it).toBe("function");
    // jest === vi: has the core mock factory
    expect(typeof shim.jest.fn).toBe("function");
    const f = shim.jest.fn();
    f("x");
    expect(f).toHaveBeenCalledWith("x");
  });
});

describe("jest-compat: extend-expect no-op", () => {
  it("default export is an empty object", async () => {
    const noop = await import("../src/jest-compat/noop.mjs");
    expect(noop.default).toEqual({});
  });
});

describe("jest-compat: setup", () => {
  it("installs a `jest` global backed by vi with sync requireActual", async () => {
    await import("../src/jest-compat/setup.mjs");
    const jestGlobal = (globalThis as { jest?: typeof vi }).jest;
    expect(jestGlobal).toBeDefined();
    expect(typeof jestGlobal!.fn).toBe("function");
    expect(typeof jestGlobal!.requireActual).toBe("function");
    // requireActual resolves a real module synchronously (use react — no Flow).
    const React = jestGlobal!.requireActual("react") as { createElement: unknown };
    expect(typeof React.createElement).toBe("function");
  });

  it("installs a global `require` so jest.mock factories can require() synchronously", async () => {
    await import("../src/jest-compat/setup.mjs");
    const req = (globalThis as { require?: (m: string) => unknown }).require;
    expect(typeof req).toBe("function");
    const React = req!("react") as { createElement: unknown };
    expect(typeof React.createElement).toBe("function");
  });
});

describe("jest-compat: unsupported Jest APIs are signposts, not TypeErrors", () => {
  it("isolateModules / createMockFromModule / genMockFromModule / deepUnmock throw actionable errors", async () => {
    await import("../src/jest-compat/setup.mjs");
    const jestGlobal = (globalThis as { jest?: Record<string, (...a: unknown[]) => unknown> })
      .jest!;
    for (const name of [
      "isolateModules",
      "createMockFromModule",
      "genMockFromModule",
      "deepUnmock",
    ]) {
      expect(() => jestGlobal[name]("x")).toThrow(/no Vitest equivalent.*migrating-from-jest/s);
    }
  });

  it("retryTimes warns once and continues (does not crash the suite)", async () => {
    await import("../src/jest-compat/setup.mjs");
    const jestGlobal = (globalThis as { jest?: { retryTimes: (n: number) => void } }).jest!;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => jestGlobal.retryTimes(3)).not.toThrow();
      jestGlobal.retryTimes(3);
      const warnings = warn.mock.calls.filter((c) => String(c[0]).includes("retryTimes"));
      expect(warnings).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});
