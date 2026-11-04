/**
 * One instance of a project module per test file, without jest-compat or any library's
 * Jest setup: a project file the test imports through Vite is the module Node returns
 * when a project file `require`s it. Run by vitest.one-instance.config.mts, which has no
 * setup files of its own, so nothing but the native engine installs the sharing.
 */
import { expect, it } from "vitest";
import { state } from "./fixtures/store";

it("a store the test imported is the one a required project module reads", () => {
  state.value = "written by the test";
  const read = require("./fixtures/reader.cjs") as () => string | null;
  expect(read()).toBe("written by the test");
});

it("require() of the imported module itself returns the same exports", () => {
  const required = require("./fixtures/store") as { state: typeof state };
  expect(required.state).toBe(state);
});
