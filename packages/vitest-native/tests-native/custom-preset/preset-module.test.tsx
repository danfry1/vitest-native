/**
 * A preset given as a module path (`presets: { './zz-lib-preset.ts': true }`, beside
 * auto-detection), under the engine the config's --mode names. A preset object of the project's own cannot reach
 * the test workers, so the plugin imports the module there; before, a project's own
 * preset shadowed its package with a module whose every export was undefined.
 */
import { createRequire } from "node:module";
import React from "react";
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react-native";
// @ts-expect-error -- not a real package; the preset module shadows it.
import { Badge, greet } from "zz-lib";

it("serves the preset module's mock to import and require()", () => {
  expect(greet("ada")).toBe("hello ada");
  expect(greet).toHaveBeenCalledWith("ada");
  expect(createRequire(import.meta.url)("zz-lib").greet).toBe(greet);
});

it("renders its components through React Native", async () => {
  await render(<Badge label="new" />);
  expect(screen.getByText("new")).toBeTruthy();
});

it("prepared the preset before the user's setup files ran", () => {
  expect((globalThis as any).__zzLibPreparedAtUserSetup).toBe(true);
});

it("keeps the presets auto-detection chose", () => {
  // react-native-reanimated is a devDependency here, so its preset is detected.
  expect(
    (globalThis as any).__vitest_native_preset_mocks?.["react-native-reanimated"],
  ).toBeDefined();
});
