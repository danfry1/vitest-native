/**
 * `jest.resetModules()` + `require()`, with a React Native internal mocked.
 *
 * From a production app: `beforeEach(() => jest.resetModules())` and a `load()` helper
 * that `require`s the module under test, while `jest.mock` replaces
 * `react-native/Libraries/AppState/AppState`. Under Jest the required module sees the
 * mock — through React Native's own `require('./Libraries/AppState/AppState')` behind
 * `import { AppState } from 'react-native'` — and is fresh after every reset, while the
 * factory stays registered: `Runtime.resetModules` clears `_moduleRegistry` and
 * `_mockRegistry` (the factories' cached results) but not `_mockFactories`
 * (jest-runtime 29.7).
 */
import { AppState as ImportedAppState } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl?: T): T;
  isMockFunction(value: unknown): boolean;
  requireMock<T = any>(path: string): T;
  resetModules(): void;
};

jest.mock("react-native/Libraries/AppState/AppState", () => ({
  __esModule: true,
  default: {
    currentState: "background",
    addEventListener: jest.fn(() => ({ remove: () => {} })),
  },
}));

type AppStateModule = typeof import("./fixtures/alias-app/registry/app-state");
function load(): AppStateModule {
  return require("@vn-app/registry/app-state");
}

beforeEach(() => {
  jest.resetModules();
});

describe("jest.resetModules with require()", () => {
  it("the required module sees the React Native mock", () => {
    const appState = load();
    expect(appState.initialState).toBe("background");
    appState.onChange(() => {});
    const mock = jest.requireMock("react-native/Libraries/AppState/AppState").default;
    expect(mock.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("serves one instance until the next reset, and a fresh one after it", () => {
    const first = load();
    expect(load()).toBe(first);
    jest.resetModules();
    const second = load();
    expect(second).not.toBe(first);
    expect(second.loadToken).not.toBe(first.loadToken);
    expect(second.initialState).toBe("background");
  });

  it("keeps React Native and other packages resident", () => {
    const reactNative = require("react-native");
    const react = require("react");
    // A package first loaded by this test, after the registry was installed.
    const firstLoadedHere = require("rn-condition-cjs-lib");
    jest.resetModules();
    expect(require("react-native")).toBe(reactNative);
    expect(require("react")).toBe(react);
    expect(require("rn-condition-cjs-lib")).toBe(firstLoadedHere);
  });

  it("keeps the factory but re-runs it after a reset", () => {
    const before = jest.requireMock("react-native/Libraries/AppState/AppState");
    expect(jest.requireMock("react-native/Libraries/AppState/AppState")).toBe(before);
    jest.resetModules();
    const after = jest.requireMock("react-native/Libraries/AppState/AppState");
    expect(after).not.toBe(before);
    expect(after.default.currentState).toBe("background");
  });

  it("applies to React Native's own require behind require('react-native')", () => {
    const { AppState } = require("react-native");
    expect(AppState.currentState).toBe("background");
    expect(jest.isMockFunction(AppState.addEventListener)).toBe(true);
  });

  it("applies to the test file's own import from 'react-native'", () => {
    expect(ImportedAppState.currentState).toBe("background");
    expect(jest.isMockFunction(ImportedAppState.addEventListener)).toBe(true);
  });
});

// Vitest 4.1 fetches a module mocked with a factory as a placeholder node that
// remembers the factory, and its `cachedRequest` replays that factory whenever the
// module has any mock, so a factoryless `vi.doMock` after it got the old factory. The
// reset invalidates such nodes (module-reset.mjs), and the module is then looked up
// under the current mocks, as Vitest 5 does. Without a reset, Vitest 4.1 still
// replays the factory: that is its own behaviour. Only Vitest 4.1 can fail this.
describe("jest.resetModules with vi.doMock", () => {
  it("a factoryless vi.doMock after the reset automocks a module an earlier factory mocked", async () => {
    vi.doMock("./fixtures/alias-app/registry/counter", () => ({ increment: () => -1 }));
    expect((await import("./fixtures/alias-app/registry/counter")).increment()).toBe(-1);
    jest.resetModules();
    vi.doMock("./fixtures/alias-app/registry/counter");
    const automocked = await import("./fixtures/alias-app/registry/counter");
    vi.doUnmock("./fixtures/alias-app/registry/counter");
    expect(vi.isMockFunction(automocked.increment)).toBe(true);
    expect(automocked.increment()).toBeUndefined();
  });
});
