/**
 * An alias keyed on a preset package's name, as Node's require sees it (ADR-0007): the
 * preset beats the alias, because the preset step answers the request before
 * resolution, where the alias applies. Under Jest the moduleNameMapper wins: a
 * documented divergence, which only a jestCompat entry may change.
 */
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const presets = (globalThis as { __vitest_native_preset_mocks?: Record<string, unknown> })
  .__vitest_native_preset_mocks!;

it("a preset beats an alias keyed on its package's name", () => {
  const required = createRequire(import.meta.url)("react-native-safe-area-context");
  expect(required).toBe(presets["react-native-safe-area-context"]);
  expect(required).not.toEqual({ source: "alias target" });
});
