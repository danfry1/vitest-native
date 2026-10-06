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
    const ns = jestMockInterop(esm);
    expect(ns.default).toBe("d");
    expect(Object.keys(ns)).toEqual(["__esModule", "default", "a"]);
  });

  it("respects an explicit default key", () => {
    const m = { default: "d", a: 1 };
    const ns = jestMockInterop(m);
    expect(ns.default).toBe("d");
    expect(ns.a).toBe(1);
  });

  it("does not run a getter until the export is read, and reads it live", () => {
    // A factory runs during the hoisted imports, before the test file's `let`s are
    // initialised, so a getter over one threw at interop time when the copy was a
    // spread. Jest reads the property only when the app does.
    let reads = 0;
    let value = "first";
    const exports = {
      get IS_WEB() {
        reads++;
        return value;
      },
    };
    const ns = jestMockInterop(exports);
    expect(reads).toBe(0);
    expect(ns.IS_WEB).toBe("first");
    value = "second";
    expect(ns.IS_WEB).toBe("second");
    expect(ns.default).toBe(exports);
  });

  it("reads an accessor through the module, as an importer does in Jest", () => {
    // `jest.requireActual('react-native')` is a proxy whose overrides live in its get
    // trap; copying the getter itself would bypass them and read the original.
    const real = {
      get Platform() {
        return { OS: "ios" };
      },
    };
    const overridden = new Proxy(real, {
      get: (target, key) => (key === "Platform" ? { OS: "android" } : Reflect.get(target, key)),
    });
    expect(jestMockInterop(overridden).Platform).toEqual({ OS: "android" });
    // ...and runs with the module as `this`.
    const withSibling = {
      a: 1,
      get b() {
        return (this as { a: number }).a + 1;
      },
    };
    expect(jestMockInterop(withSibling).b).toBe(2);
  });

  it("copies data properties and function statics as the spread did", () => {
    const exports = { a: 1, fn: () => 2 };
    const ns = jestMockInterop(exports);
    expect({ ...ns }).toEqual({ a: 1, fn: exports.fn, default: exports });
    ns.a = 5; // still a plain writable copy
    expect(ns.a).toBe(5);
    expect(exports.a).toBe(1);
    const Component = Object.assign(() => null, { displayName: "C" });
    expect(jestMockInterop(Component).displayName).toBe("C");
  });

  it("reports a missing export as present and undefined, as Jest's CommonJS does", () => {
    // Vitest's mock proxy throws `No "x" export is defined` when `!(x in exports)`.
    for (const exports of [{ a: 1 }, { __esModule: true, default: "d" }, () => null]) {
      const ns = jestMockInterop(exports);
      expect("applicationId" in ns).toBe(true);
      expect(ns.applicationId).toBeUndefined();
      // Enumeration still sees only the real members, and it is never a thenable.
      expect(Object.keys(ns)).not.toContain("applicationId");
      expect("then" in ns).toBe(false);
    }
  });

  it("passes null/undefined through", () => {
    expect(jestMockInterop(null)).toBeNull();
    expect(jestMockInterop(undefined)).toBeUndefined();
  });

  it("applies interop to a promised module rather than to the promise", async () => {
    // A promise has no own enumerable keys and no `default`, so the object branch
    // turned it into `{ default: Promise }` — the named exports disappeared and
    // Vitest reported them missing from a vi.mock the author never wrote.
    const exports = { a: 1 };
    const ns = await jestMockInterop(Promise.resolve(exports));
    expect(ns.a).toBe(1);
    expect(ns.default).toBe(exports);
  });

  it("leaves an already-ES-shaped promised module alone", async () => {
    const esm = { __esModule: true, default: "d", a: 1 };
    const ns = await jestMockInterop(Promise.resolve(esm));
    expect(ns.default).toBe("d");
    expect(ns.a).toBe(1);
  });

  it("does not mistake a module exporting `then` for a promise", () => {
    // Both shapes matter, and the function one is the dangerous half: awaiting a
    // thenable calls then(resolve, reject), which for an ordinary exported function
    // never settles — the file would hang instead of failing.
    for (const m of [{ then: 42 }, { then: () => "not a promise" }]) {
      const ns = jestMockInterop(m);
      expect(ns.then).toBe(m.then);
      expect(ns.default).toBe(m);
    }
  });
});

describe("jest-compat: jest.fn / jest.spyOn follow Jest under `new`", () => {
  type Jest = typeof vi;
  let jest: Jest;
  it("loads the jest object", async () => {
    const { createJestObject } = await import("../src/jest-compat/jest-object.mjs");
    jest = createJestObject(vi) as Jest;
    expect(typeof jest.fn).toBe("function");
  });

  it("constructs with an arrow implementation and returns its object", () => {
    // jest-mock applies the implementation even under `new`; Vitest constructs it,
    // and an arrow function is not a constructor.
    const instance = { fetch: 1 };
    const viaImplementation = jest.fn().mockImplementation(() => instance);
    const viaFactory = jest.fn(() => instance);
    const viaOnce = jest.fn().mockImplementationOnce(() => instance);
    for (const Ctor of [viaImplementation, viaFactory, viaOnce]) {
      expect(new (Ctor as unknown as new () => unknown)()).toBe(instance);
      expect(vi.isMockFunction(Ctor)).toBe(true);
      expect(Ctor.mock.calls).toEqual([[]]);
      expect(Ctor.mock.instances).toEqual([instance]);
    }
  });

  it("returns the fresh instance when the implementation returns a primitive", () => {
    const Ctor = jest.fn().mockImplementation(function (this: { x?: number }) {
      this.x = 1;
    }) as unknown as new () => { x: number };
    expect(new Ctor().x).toBe(1);
    const Arrow = jest.fn(() => 42) as unknown as new () => object;
    expect(new Arrow()).toBeInstanceOf(Arrow);
  });

  it("the value helpers are defined through mockImplementation, as in jest-mock", async () => {
    const value = { v: 1 };
    const Returning = jest.fn().mockReturnValue(value) as unknown as new () => unknown;
    expect(new Returning()).toBe(value);
    const Once = jest.fn().mockReturnValueOnce(value) as unknown as new () => unknown;
    expect(new Once()).toBe(value);
    const resolved = jest.fn().mockResolvedValue(value);
    await expect(resolved()).resolves.toBe(value);
    const rejected = jest.fn().mockRejectedValueOnce(new Error("no"));
    await expect(rejected()).rejects.toThrow("no");
  });

  it("keeps the rest of the mock API, and reports the implementation that was passed", () => {
    const impl = (a: number) => a * 2;
    const f = jest.fn(impl);
    expect(f(2)).toBe(4);
    expect(f.getMockImplementation()).toBe(impl);
    expect(f.length).toBe(1);
    f.mockReturnValue(7);
    expect(f(1)).toBe(7);
    f.mockReset();
    expect(f(3)).toBe(6); // reset restores the jest.fn(impl) implementation
    expect(jest.mocked(f)).toBe(f);
    // A mock passed to jest.fn is returned as it is, as vi.fn does.
    const existing = vi.fn();
    expect(jest.fn(existing)).toBe(existing);
  });

  it("jest.spyOn gets the same semantics", () => {
    const mod = {
      Api: class {
        real = true;
      },
    };
    const spy = jest.spyOn(mod, "Api").mockImplementation(() => ({ fetch: 2 }));
    expect(new mod.Api()).toEqual({ fetch: 2 });
    spy.mockRestore();
  });

  it("leaves vi.fn itself unchanged", () => {
    expect(jest.isMockFunction).toBe(vi.isMockFunction);
    const viMock = vi.fn().mockImplementation(() => ({}));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => new (viMock as unknown as new () => unknown)()).toThrow(/not a constructor/);
    } finally {
      warn.mockRestore();
    }
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

  it("sets JEST_WORKER_ID from Vitest's pool id, as Jest's 1-based worker id", async () => {
    const previous = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    try {
      vi.resetModules();
      await import("../src/jest-compat/setup.mjs");
      expect(process.env.JEST_WORKER_ID).toBe(process.env.VITEST_POOL_ID);
      expect(Number(process.env.JEST_WORKER_ID)).toBeGreaterThanOrEqual(1);
      // A value already in the environment is the user's, and is left alone.
      process.env.JEST_WORKER_ID = "7";
      vi.resetModules();
      await import("../src/jest-compat/setup.mjs");
      expect(process.env.JEST_WORKER_ID).toBe("7");
    } finally {
      if (previous === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = previous;
    }
  });

  it("the jest global constructs a jest.fn with an arrow implementation", async () => {
    await import("../src/jest-compat/setup.mjs");
    const jestGlobal = (globalThis as { jest?: typeof vi }).jest!;
    const Ctor = jestGlobal.fn().mockImplementation(() => ({ fetch: 1 }));
    expect(new (Ctor as unknown as new () => unknown)()).toEqual({ fetch: 1 });
    // ...while members installed on vi stay reachable through it.
    expect((jestGlobal as { requireActual?: unknown }).requireActual).toBe(
      (vi as { requireActual?: unknown }).requireActual,
    );
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
