/**
 * Unit coverage for the shipped jest-compat shims. End-to-end validation (the
 * `@jest/globals` alias + setup wiring against a real jest-coupled suite) lives in
 * the real-app bakeoff; see docs/migrating-from-jest.md.
 */
import { describe, it, expect, vi } from "vitest";
import { jestCompatAliases, jestCompatSetup } from "../src/jest-compat/index.js";

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
