/**
 * Importing Expo must leave the globals the test runner itself depends on in place.
 *
 * Expo's winter runtime sets up React Native's environment on import. On SDK 58 that
 * went through `react-native/setup-env`, whose setUpTimers swapped Node's timers for
 * React Native's native-driven ones: no timer fired again and the file hung without
 * an error (#296). Expo replacing web globals such as `fetch` and `URL` is its
 * documented behaviour, and jest-expo installs the same ones, so they are not
 * asserted here.
 */
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

const RUNNER_GLOBALS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "Promise",
] as const;

it("keeps Node's timers, microtasks and Promise after loading expo and expo-router", () => {
  const g = globalThis as Record<string, unknown>;
  const before = RUNNER_GLOBALS.map((name) => Object.getOwnPropertyDescriptor(g, name));
  let replaced: string[];
  // Loaded with a synchronous require (both are Node-owned under the native engine, so
  // this is the module an import gets). With React Native's Promise and timers in
  // place nothing awaited settles, so an `await import` would hang rather than fail;
  // the globals are compared and put back before anything awaits.
  try {
    require("expo");
    require("expo-router");
  } finally {
    replaced = RUNNER_GLOBALS.filter((name, i) => g[name] !== before[i]?.value);
    RUNNER_GLOBALS.forEach((name, i) => Object.defineProperty(g, name, before[i]!));
  }
  expect(replaced).toEqual([]);
});
