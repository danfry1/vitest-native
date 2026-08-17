/**
 * Regression coverage for top-level exports introduced in react-native 0.87,
 * flagged by the weekly compatibility check (issue #179). AssetRegistry mirrors
 * @react-native/assets-registry/registry: 1-based ids from registerAsset (the
 * real module returns Array.push's new length so the first id is truthy).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AssetRegistry } from "react-native";
import { resetAllMocks } from "vitest-native/helpers";

describe("AssetRegistry (RN 0.87)", () => {
  beforeEach(() => resetAllMocks());

  it("registerAsset returns 1-based truthy ids and getAssetByID reads them back", () => {
    const a = { name: "logo", type: "png" };
    const b = { name: "icon", type: "ttf" };
    const idA = AssetRegistry.registerAsset(a);
    const idB = AssetRegistry.registerAsset(b);
    expect(idA).toBe(1);
    expect(idB).toBe(2);
    expect(AssetRegistry.getAssetByID(idA)).toBe(a);
    expect(AssetRegistry.getAssetByID(idB)).toBe(b);
    expect(AssetRegistry.getAssetByID(999)).toBeUndefined();
  });

  it("resetAllMocks clears the registered assets", () => {
    AssetRegistry.registerAsset({ name: "x" });
    resetAllMocks();
    expect(AssetRegistry.registerAsset({ name: "y" })).toBe(1);
    expect(AssetRegistry.getAssetByID(2)).toBeUndefined();
  });
});
