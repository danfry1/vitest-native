import { expect, it } from "vitest";

it("preserves only explicitly allowlisted resident globals", () => {
  const globals = globalThis as Record<string, unknown>;
  const bless = globals.__vitest_native_hot_bless as (() => void) | undefined;
  const reset = globals.__vitest_native_hot_reset as (() => void) | undefined;

  expect(bless).toBeTypeOf("function");
  expect(reset).toBeTypeOf("function");

  globals.__VN_EXPLICIT_RESIDENT_GLOBAL__ = "configured";
  globals.__STORYBOOK_ADDONS_PREVIEW = "built-in";
  bless?.();
  reset?.();

  expect(globals.__VN_EXPLICIT_RESIDENT_GLOBAL__).toBe("configured");
  expect(globals.__STORYBOOK_ADDONS_PREVIEW).toBe("built-in");

  delete globals.__VN_EXPLICIT_RESIDENT_GLOBAL__;
  delete globals.__STORYBOOK_ADDONS_PREVIEW;
});
