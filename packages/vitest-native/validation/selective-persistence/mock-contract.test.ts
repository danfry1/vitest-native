import { expect, test, vi } from "vitest";

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    Platform: { OS: "android" },
  };
});

import { Platform } from "react-native";

test("overlays a standard partial mock on the preserved actual", () => {
  expect(Platform.OS).toBe("android");
});
