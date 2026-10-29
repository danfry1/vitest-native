// One native file, run under each variant of vitest.context.config.mts. Each is a setup
// main runs, so each must keep running with the project context.
import { Platform, View } from "react-native";
import { expect, test } from "vitest";
import { projectContext } from "../../src/context.mjs";

test("renders with the project context under this variant", () => {
  expect(View).toBeDefined();
  expect(Platform.OS).toBe("ios");
  expect(projectContext()?.projectRoot).toBeTruthy();
});

test("hot ESM generation follows the plugin's option", () => {
  const expected = process.env.VN_EXPECT_ESM_GENERATION;
  if (expected === undefined) return;
  const live = (globalThis as { __vitest_native_hot_generation?: unknown })
    .__vitest_native_hot_generation;
  expect(live !== undefined).toBe(expected === "1");
});
