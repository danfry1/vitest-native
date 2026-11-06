/**
 * A jest.mock factory that `require`s project source the test has not imported yet:
 *
 *   jest.mock('#/state/persisted', () => {
 *     const { defaults } = require('#/state/persisted/schema')
 *     ...
 *
 * The factory runs while the first import is evaluated, before Vite has reached that
 * source, so a synchronous require loaded it, and everything it imports, through Node: a
 * second copy of each file, which the ownership guard reported once per file and test
 * file (bluesky-social/social-app: 657 files). jestMockTransform now loads it through
 * Vite (transform.ts), where the rest of the test finds the same instance. As under
 * Jest's registry, a module the file mocks is still the mock.
 */
import { expect, it } from "vitest";
import { flag, read } from "./fixtures/factory-require/api";
import { store } from "./fixtures/factory-require/store";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("./fixtures/factory-require/config", () => ({ flag: "mocked" }));
jest.mock("./fixtures/factory-require/api", () => {
  const { store: required } = require("./fixtures/factory-require/store");
  const config = require("./fixtures/factory-require/config");
  return { read: () => required.value, flag: config.flag };
});

it("shares the store the test imports", () => {
  store.value = "set-by-the-test";
  expect(read()).toBe("set-by-the-test");
});

it("gets the mock of a module the file mocks", () => {
  expect(flag).toBe("mocked");
});
