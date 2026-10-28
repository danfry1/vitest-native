/**
 * A library's own Jest support runs with Jest's semantics (native/library-jest.mjs):
 * its setup file's `jest.mock` reaches every require of the module, its mock's
 * `@jest/globals` and `jest.requireActual` work, and an implementation it installs while
 * building its mocks survives a reset. The fixture (fixtures/vn-lib-jest-support) is
 * shaped like react-native-gesture-handler's jestSetup.js and safe-area-context's
 * jest/mock.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs
import { beginTestFile } from "../dist/native/library-jest.mjs";

const require = createRequire(import.meta.url);
const globalJestBefore = (globalThis as { jest?: unknown }).jest;

// As a suite migrated from Jest lists `react-native-gesture-handler/jestSetup`.
require("vn-lib-jest-support/jestSetup");

describe("a library's jestSetup", () => {
  it("mocks the library's native module for its own require of it", () => {
    const lib = require("vn-lib-jest-support");
    expect(lib.read()).toBe("mocked");
    expect(lib.count()).toBe(3);
  });

  it("keeps the implementations it installed through vi.resetAllMocks()", () => {
    const lib = require("vn-lib-jest-support");
    vi.resetAllMocks();
    // Vitest's reset drops `mockReturnValue`/`mockImplementation`; these were the
    // library's own, so the mocks return to them.
    expect(lib.read()).toBe("mocked");
    expect(lib.count()).toBe(3);
  });
});

describe("a library's mock", () => {
  it("gets @jest/globals and the real package from jest.requireActual", () => {
    const mock = require("vn-lib-jest-support/jest/mock");
    expect(mock.extra()).toBe("extra");
    // The actual package, over the native module the setup file mocked.
    expect(mock.actualRead()).toBe("mocked");
  });
});

it("leaves the global jest as it was", () => {
  // RNTL and others read `typeof jest` to decide whether they run under Jest, so the
  // library's `jest` is its files' own, never the global one.
  expect((globalThis as { jest?: unknown }).jest).toBe(globalJestBefore);
});

it("loads a support file published as an ES module that mentions jest", () => {
  // Its syntax cannot sit in a function body, so it is not given a `jest`.
  expect(require("vn-lib-jest-support/jest/esm.js").viaEsm).toBe("esm");
  expect(require("vn-lib-jest-support/jest/esm-min.js").viaEsm).toBe("min");
});

it("gives a CommonJS support file its jest when a comment line starts with `export`", () => {
  expect(require("vn-lib-jest-support/jest/commented.js").isLibraryJest).toBe(true);
});

it("gives no library jest to the project's own mock files", () => {
  // Its mocks would otherwise keep their implementations through a reset.
  const file = path.join(import.meta.dirname, "fixtures/project-own-support/src/api/mock.cjs");
  expect(require(file).isLibraryJest).toBe(false);
});

it("serves a workspace library's own jestSetup, linked from outside node_modules", () => {
  const dir = path.join(import.meta.dirname, "fixtures", "vn-ws-lib");
  require(path.join(dir, "jestSetup.js"));
  expect(require(path.join(dir, "index.js")).read()).toBe("mocked");
});

describe("at the next test file in the same worker", () => {
  // The native setup calls beginTestFile as each file starts. A reused worker
  // (`isolate: false`) keeps modules, so a support module that will not run again
  // keeps its mocks; one gone from the module cache runs again and registers again.
  const nativeThing = () => require("vn-lib-jest-support/NativeThing.js");

  it("keeps what a still-loaded support module registered", () => {
    beginTestFile();
    expect(nativeThing().read()).toBe("mocked");
  });

  it("drops what a support module no longer loaded registered", () => {
    delete require.cache[require.resolve("vn-lib-jest-support/jestSetup")];
    beginTestFile();
    expect(() => nativeThing().read()).toThrow("NativeThing is a native module");
  });
});
