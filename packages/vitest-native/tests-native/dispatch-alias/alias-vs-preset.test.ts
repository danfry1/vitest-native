/**
 * An alias keyed on a preset package's name, as Node's require sees it (ADR-0007): the
 * preset's module, not the alias target. Two things make it so, whatever the step
 * order: the preset step answers a package name before resolution, and Node applies a
 * project alias only to a request it cannot resolve, which an installed package's name
 * never is. Under Jest the moduleNameMapper wins: a documented divergence, which only a
 * jestCompat entry may change.
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
