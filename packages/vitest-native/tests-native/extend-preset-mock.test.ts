/**
 * extendPresetMock(): augment a preset's module mock with extra or replaced
 * exports, undone by resetAllMocks(). Uses the auto-detected expo preset
 * (expo-constants is a devDependency here).
 */
import { describe, expect, it } from "vitest";
import { extendPresetMock, resetAllMocks } from "vitest-native/helpers";

describe("extendPresetMock", () => {
  it("merges overrides into the preset mock and its default export", async () => {
    const applied = extendPresetMock("expo-constants", {
      expoConfig: { name: "my-app", slug: "my-app", scheme: "my-app" },
      linkingUri: "my-app://",
    });
    expect(applied).toBe(true);

    const Constants = (await import("expo-constants")).default;
    expect(Constants.expoConfig).toEqual({ name: "my-app", slug: "my-app", scheme: "my-app" });
    expect(Constants.linkingUri).toBe("my-app://");
  });

  it("is undone by resetAllMocks()", async () => {
    extendPresetMock("expo-constants", {
      expoConfig: { name: "temporary" },
      addedOnlyForThisTest: "x",
    });
    resetAllMocks();

    const Constants = (await import("expo-constants")).default;
    expect(Constants.expoConfig?.name).toBe("test-app");
    expect("addedOnlyForThisTest" in Constants).toBe(false);
  });

  it("returns false when no preset mock exists for the package", () => {
    expect(extendPresetMock("not-a-shadowed-package", { x: 1 })).toBe(false);
  });
});
