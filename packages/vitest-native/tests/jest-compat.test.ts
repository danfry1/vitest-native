/**
 * Unit coverage for the shipped jest-compat shims. End-to-end validation (the
 * `@jest/globals` alias + setup wiring against a real jest-coupled suite) lives in
 * the real-app bakeoff; see docs/migrating-from-jest.md.
 */
import { describe, it, expect, vi } from "vitest";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "../src/jest-compat/index.js";

describe("jest-compat: jestMockTransform (hoistable jest.mock rewrite)", () => {
  // The plugin's transform hook; call it directly with (code, id).
  const plugin = jestMockTransform();
  const run = (code: string, id = "/proj/src/foo.test.tsx") => {
    const t = plugin.transform as (this: unknown, c: string, i: string) => { code: string } | null;
    return t.call({}, code, id);
  };

  it("rewrites hoistable jest.mock/unmock/doMock/doUnmock to vi, length-preserved", () => {
    const out = run(
      [
        "jest.mock('react-native', () => ({}));",
        "jest.unmock('x');",
        "jest.doMock('y', () => ({}));",
        "jest.doUnmock('z');",
      ].join("\n"),
    );
    expect(out).not.toBeNull();
    const lines = out!.code.split("\n");
    expect(lines[0]).toBe("vi  .mock('react-native', () => ({}));");
    expect(lines[1]).toBe("vi  .unmock('x');");
    expect(lines[2]).toBe("vi  .doMock('y', () => ({}));");
    expect(lines[3]).toBe("vi  .doUnmock('z');");
    // length preserved per line (so source positions are unchanged, no map needed)
    expect(lines[0].length).toBe("jest.mock('react-native', () => ({}));".length);
  });

  it("matches Vitest's own hoist regex after rewrite", () => {
    const hoistRe = /\b(?:vi|vitest)\s*\.\s*(?:mock|unmock|hoisted|doMock|doUnmock)\s*\(/;
    const out = run("jest.mock('m', () => ({}))");
    expect(hoistRe.test(out!.code)).toBe(true);
  });

  it("leaves non-hoistable jest.* calls untouched", () => {
    const src = "const f = jest.fn(); jest.requireActual('react'); jest.mocked(f); jest.spyOn(o,'m');";
    const out = run(src);
    expect(out).toBeNull(); // nothing to rewrite → no transform
  });

  it("ignores node_modules and non-source files", () => {
    expect(run("jest.mock('x', () => ({}))", "/proj/node_modules/lib/index.js")).toBeNull();
    expect(run("jest.mock('x', () => ({}))", "/proj/src/data.json")).toBeNull();
  });

  it("rewrites jest.mock with surrounding whitespace forms (length preserved)", () => {
    const src = "jest . mock ('x', () => ({}))";
    const out = run(src);
    expect(out!.code.length).toBe(src.length);
    expect(out!.code.startsWith("vi  ")).toBe(true);
    expect(/\bvi\s*\.\s*mock\s*\(/.test(out!.code)).toBe(true);
    expect(out!.code).not.toContain("jest");
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
});
