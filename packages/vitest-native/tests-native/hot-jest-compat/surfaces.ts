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
import React from "react";
import { Alert, Platform, Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, vi } from "vitest";
import { greet } from "../fixtures/greeter";
import { readSetting } from "../fixtures/settings-store";
import * as lib from "rn-singleton-lib";
import * as ecosystemLib from "rn-ecosystem-lib";
import { source as setupMockedSource } from "./fixtures/setup-mocked";
import { compute } from "./fixtures/automocked";
import { source } from "./fixtures/dir-mocked";
import { value } from "./fixtures/runtime-mocked";

declare const jest: typeof vi & { requireActual<T>(id: string): T };

type Mocked =
  | "greeter"
  | "settings"
  | "lib"
  | "react-native"
  | "dir-mocked"
  | "automocked"
  | "runtime-mocked"
  | "node-registry";

const LEAK_MARKER = "hot-jest-compat rendered and never unmounted";

// This module is Vite-owned, so it evaluates once per test file; `process` is not
// reset between files. The count therefore says how many files this worker has run.
const FILES_SEEN = Symbol.for("vitest-native.hot-jest-compat.files-seen");
const proc = process as unknown as Record<symbol, number>;
proc[FILES_SEEN] = (proc[FILES_SEEN] ?? 0) + 1;

/** Files this worker process has evaluated so far, including the current one. */
export function filesSeenByThisWorker(): number {
  return proc[FILES_SEEN];
}

// The lenient timer-advance guard jest-compat installs on `vi`, as first seen by this
// worker: a later file seeing a different function means it was wrapped again.
const FIRST_ADVANCE = Symbol.for("vitest-native.hot-jest-compat.first-advance");

/** Assert the project setup file applied each of its effects exactly once here. */
export function expectSetupAppliedOnce(): void {
  expect(setupMockedSource(), "jest.mock of an app module in a setup file").toBe("mocked-by-setup");
  expect(
    (ecosystemLib as Record<string, unknown>).mockedBySetup,
    "jest.mock of a Node-owned package in a setup file",
  ).toBe(true);
  (expect("setup") as unknown as { toBeTheSetupMatcher(): void }).toBeTheSetupMatcher();
  expect(
    (globalThis as Record<string, unknown>).__vnSetupRuns,
    "a global the setup file increments (stacked if above 1)",
  ).toBe(1);
  expect(vi.isMockFunction(console.warn), "jest.spyOn(console) in a setup file").toBe(true);
  const advance = vi.advanceTimersByTime;
  proc[FIRST_ADVANCE] ??= advance as unknown as number;
  expect(advance, "jest-compat's timer guard wrapped once per worker").toBe(
    proc[FIRST_ADVANCE] as unknown,
  );
}

/** Assert every surface this file did not mock itself is in its pristine state. */
export function expectCleanExcept(mockedHere: Mocked[]): void {
  const mine = new Set(mockedHere);
  expectSetupAppliedOnce();
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
    expect(
      vi.isMockFunction(jest.requireActual<Record<string, unknown>>("rn-singleton-lib").markLoader),
      "jest.spyOn on a Node-owned package's export",
    ).toBe(false);
  }
  if (!mine.has("react-native")) {
    expect(Platform.OS, "jest.requireActual('react-native') override").toBe("ios");
  }
  expect(vi.isMockFunction(Alert.alert), "jest.spyOn on a React Native API").toBe(false);
  expect(vi.isMockFunction(console.error), "jest.spyOn on console").toBe(false);
  expect(vi.isFakeTimers(), "jest.useFakeTimers()").toBe(false);
  // Against the real clock, not just "not frozen": a skewed restore fails too.
  expect(
    Math.abs(Date.now() - (performance.timeOrigin + performance.now())),
    "jest.setSystemTime under fake timers",
  ).toBeLessThan(60_000);
  expect((globalThis as Record<string, unknown>).__vnLeakedJestFn, "jest.fn on a global").toBe(
    undefined,
  );
  expect(process.env.VN_LEAKED_ENV, "process.env mutation").toBe(undefined);
  if (!mine.has("dir-mocked")) {
    expect(source(), "factory-less jest.mock via __mocks__").toBe("real-dir-mocked");
  }
  if (!mine.has("automocked")) {
    expect(compute(), "factory-less jest.mock (automock)").toBe("real-automocked");
  }
  if (!mine.has("runtime-mocked")) {
    expect(value(), "jest.doMock at runtime").toBe("real-runtime");
    // The same doMock reaches Node's require through jest-compat's per-file registry.
    expect(require("./fixtures/runtime-mocked").value(), "jest.doMock seen by require()").toBe(
      "real-runtime",
    );
  }
  if (!mine.has("node-registry")) {
    expect(
      require("./fixtures/node-registry-mocked").value(),
      "jest.mock seen by require() (jest-compat's per-file registry)",
    ).toBe("real-node-registry");
  }
  expect(
    () => (jest as unknown as { isolateModules(fn: () => void): void }).isolateModules(() => {}),
    "an isolateModulesAsync block an earlier file left open",
  ).not.toThrow();
  // A React Native Testing Library tree the previous file rendered and never
  // unmounted must not be what `screen` sees here. Before this file renders, screen
  // either has no tree (and throws) or has one without the marker.
  let leaked: unknown = null;
  try {
    leaked = screen.queryByText(LEAK_MARKER);
  } catch {
    // no rendered tree: clean
  }
  expect(leaked, "React Native Testing Library tree from an earlier file").toBe(null);
}

/** Dirty every jest-compat surface, with no cleanup — as a Jest-era suite does. */
export async function polluteEverything(mockedHere: Mocked[]): Promise<void> {
  // Rendered and left mounted; RNTL's auto-cleanup is the only thing that unmounts it.
  await render(React.createElement(Text, null, LEAK_MARKER));
  // Runtime (non-hoisted) mocking, then a registry reset, as Jest-era suites do.
  jest.doMock("./fixtures/runtime-mocked", () => ({ value: () => "mocked-at-runtime" }));
  jest.resetModules();
  if (!mockedHere.includes("lib")) {
    lib.configure("polluted");
    const actual =
      jest.requireActual<Record<string, (...args: unknown[]) => unknown>>("rn-singleton-lib");
    (actual as Record<string, unknown>).__vnPolluted = true;
    jest.spyOn(actual, "markLoader").mockImplementation(() => "spied");
  }
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  (globalThis as Record<string, unknown>).__vnLeakedJestFn = jest.fn();
  process.env.VN_LEAKED_ENV = "1";
  // A short default timeout: the next file's async test fails if it survives.
  jest.setTimeout(5);
  jest.useFakeTimers();
  jest.setSystemTime(0);
}
