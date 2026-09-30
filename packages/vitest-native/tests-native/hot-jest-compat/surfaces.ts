// Cross-file isolation of the jest-compat surface under the hot runtime.
//
// Every file in this directory mocks something through the Jest API, then pollutes
// every other jest-compat surface and does not clean up — the way a migrated suite
// written for Jest's per-file module registry behaves. Before that, it asserts each
// surface it did not touch itself is clean. Under `--mode hot` the files share one
// reused worker in name order, so every file after the first fails by name if the
// previous file's state survived the boundary. Under `--mode stock` each file gets a
// fresh worker: that run is the control, proving the assertions hold under real
// isolation, so a failure in the hot run is attributable to the hot runtime.
import { Alert, Platform } from "react-native";
import { expect, vi } from "vitest";
import { greet } from "../fixtures/greeter";
import { readSetting } from "../fixtures/settings-store";
import * as lib from "rn-singleton-lib";

declare const jest: typeof vi & { requireActual<T>(id: string): T };

type Mocked = "greeter" | "settings" | "lib" | "react-native";

// This module is Vite-owned, so it evaluates once per test file; `process` is not
// reset between files. The count therefore says how many files this worker has run.
const FILES_SEEN = Symbol.for("vitest-native.hot-jest-compat.files-seen");
const proc = process as unknown as Record<symbol, number>;
proc[FILES_SEEN] = (proc[FILES_SEEN] ?? 0) + 1;

/** Files this worker process has evaluated so far, including the current one. */
export function filesSeenByThisWorker(): number {
  return proc[FILES_SEEN];
}

/** Assert every surface this file did not mock itself is in its pristine state. */
export function expectCleanExcept(mockedHere: Mocked[]): void {
  const mine = new Set(mockedHere);
  if (!mine.has("greeter")) expect(greet(), "jest.mock of an app module").toBe("real-hello");
  if (!mine.has("settings")) {
    expect(readSetting(), "jest.mock of an app module").toBe("real-setting");
  }
  if (!mine.has("lib")) {
    // Node-owned package: neither its mock, its module state, nor a mutation of the
    // exports object obtained through jest.requireActual may carry over.
    expect(lib.read(), "Node-owned package mock or module state").toBe("");
    expect(
      jest.requireActual<Record<string, unknown>>("rn-singleton-lib").__vnPolluted,
      "jest.requireActual exports of a Node-owned package",
    ).toBe(undefined);
  }
  if (!mine.has("react-native")) {
    expect(Platform.OS, "jest.requireActual('react-native') override").toBe("ios");
  }
  expect(vi.isMockFunction(Alert.alert), "jest.spyOn on a React Native API").toBe(false);
  expect(vi.isMockFunction(console.error), "jest.spyOn on console").toBe(false);
  expect(vi.isFakeTimers(), "jest.useFakeTimers()").toBe(false);
  expect((globalThis as Record<string, unknown>).__vnLeakedJestFn, "jest.fn on a global").toBe(
    undefined,
  );
  expect(process.env.VN_LEAKED_ENV, "process.env mutation").toBe(undefined);
}

/** Dirty every jest-compat surface, with no cleanup — as a Jest-era suite does. */
export function polluteEverything(mockedHere: Mocked[]): void {
  if (!mockedHere.includes("lib")) {
    lib.configure("polluted");
    jest.requireActual<Record<string, unknown>>("rn-singleton-lib").__vnPolluted = true;
  }
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  (globalThis as Record<string, unknown>).__vnLeakedJestFn = jest.fn();
  process.env.VN_LEAKED_ENV = "1";
  // A short default timeout: the next file's async test fails if it survives.
  jest.setTimeout(5);
  jest.useFakeTimers();
}
