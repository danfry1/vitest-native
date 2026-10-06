import { afterEach, describe, expect, it } from "vitest";
import { Appearance, Dimensions, Image, NativeModules, TurboModuleRegistry } from "react-native";
import {
  mockNativeModule,
  resetAllMocks,
  setColorScheme,
  setDimensions,
  setPlatform,
} from "vitest-native/helpers";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import asset from "./fixtures/test-asset.png";

afterEach(() => {
  resetAllMocks();
});

describe("native engine: shared package contract", () => {
  it("serves asset imports as Metro does: a registered asset id", () => {
    // The fixture is not a decodable image, so it registers without dimensions —
    // a malformed asset never fails the import.
    expect(typeof asset).toBe("number");
    expect(Image.resolveAssetSource(asset)).toMatchObject({
      __packager_asset: true,
      uri: expect.stringMatching(/\/test-asset\.png$/),
    });
  });

  it("serves assets required through Node's CJS loader the same way as Vite imports", () => {
    // RN components commonly do `const img = require('./logo.png')`. A literal
    // require escapes Vite's asset handling and hits Node's loader; without an
    // asset handler there it would compile the binary as JS and throw
    // "SyntaxError: Invalid or unexpected token". Must match the import path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require("./fixtures/test-asset.png")).toBe(asset);
  });

  it("drives real Dimensions state through setDimensions", () => {
    setDimensions({ width: 768, height: 1024, scale: 2, fontScale: 1 });
    expect(Dimensions.get("window")).toMatchObject({
      width: 768,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });
  });

  it("drives real Appearance state through setColorScheme", () => {
    setColorScheme("dark");
    expect(Appearance.getColorScheme()).toBe("dark");
  });

  it("injects native modules into both bridge lookup paths", () => {
    const implementation = { getValue: () => 42 };
    mockNativeModule("VitestNativeAudit", implementation);

    expect(NativeModules.VitestNativeAudit.getValue()).toBe(42);
    expect(TurboModuleRegistry.get("VitestNativeAudit")?.getValue()).toBe(42);
  });

  it("rejects runtime platform switching with an actionable error", () => {
    expect(() => setPlatform("android")).toThrow(/reactNative\(\{ platform:/);
  });
});
