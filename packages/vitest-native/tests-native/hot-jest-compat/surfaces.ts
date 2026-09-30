// Cross-file isolation of the jest-compat surface under the hot runtime.
//
// Every file in this directory mocks something through the Jest API, then pollutes
// every other jest-compat surface and does not clean up — the way a migrated suite
// written for Jest's per-file module registry behaves. Before that, it asserts each
// surface it did not touch itself is clean. Files run in one reused worker in a fixed
// order, so every file after the first fails by name if the previous file's state
// survived the boundary. Under per-file isolation the same files pass trivially.
import { Alert, Platform } from "react-native";
import { expect, vi } from "vitest";
import { greet } from "../fixtures/greeter";
import { readSetting } from "../fixtures/settings-store";
import { configure, read } from "rn-singleton-lib";

declare const jest: {
  spyOn: typeof vi.spyOn;
  fn: typeof vi.fn;
  useFakeTimers(): void;
  setTimeout(ms: number): void;
  requireActual<T>(id: string): T;
};

type Mocked = "greeter" | "settings" | "lib" | "react-native";

/** Assert every surface this file did not mock itself is in its pristine state. */
export function expectCleanExcept(mockedHere: Mocked[]): void {
  // Under the hot config the gate is vacuous unless the worker really is reused.
  if (process.env.VN_EXPECT_HOT) {
    expect(typeof (globalThis as any).__vitest_native_hot_reset, "hot runtime engaged").toBe(
      "function",
    );
  }
  const mine = new Set(mockedHere);
  if (!mine.has("greeter")) expect(greet(), "jest.mock of an app module").toBe("real-hello");
  if (!mine.has("settings")) {
    expect(readSetting(), "jest.mock of an app module").toBe("real-setting");
  }
  if (!mine.has("lib")) {
    // Node-owned package: neither its mock nor its module state may carry over.
    expect(read(), "Node-owned package mock or module state").toBe("");
  }
  if (!mine.has("react-native")) {
    expect(Platform.OS, "jest.requireActual('react-native') override").toBe("ios");
  }
  expect(vi.isMockFunction(Alert.alert), "jest.spyOn on a React Native API").toBe(false);
  expect(vi.isFakeTimers(), "jest.useFakeTimers()").toBe(false);
  expect((globalThis as Record<string, unknown>).__vnLeakedJestFn, "jest.fn on a global").toBe(
    undefined,
  );
}

/** Dirty every jest-compat surface, with no cleanup — as a Jest-era suite does. */
export function polluteEverything(mockedHere: Mocked[]): void {
  if (!mockedHere.includes("lib")) configure("polluted");
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  (globalThis as Record<string, unknown>).__vnLeakedJestFn = jest.fn();
  // A short default timeout: the next file's async test fails if it survives.
  jest.setTimeout(5);
  jest.useFakeTimers();
}
