import { expect, test, vi } from "vitest";

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    Platform: { OS: "android" },
  };
});

import { Platform } from "react-native";

// The lazy default-only capsule rewrites named imports to a default-object read.
// A normal Vitest mock overrides the named export, so the rewrite bypasses it.
// Keep this as an expected failure until the capsule can preserve Vitest's module
// contract without eagerly materialising every RN getter.
test.fails("honours a standard named vi.mock override", () => {
  expect(Platform.OS).toBe("android");
});
