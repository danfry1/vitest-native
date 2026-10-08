/**
 * Asset requires evaluate to what Metro's asset modules evaluate to: the id React
 * Native's own asset registry assigned to the asset's Metro descriptor
 * (metro/src/Bundler/util.js generateAssetCodeFileAst:
 * `module.exports = require(assetRegistryPath).registerAsset({...})`).
 *
 * Every assertion that matters goes through React Native's real consumers —
 * Image.resolveAssetSource and AssetRegistry.getAssetByID — because an id is only
 * useful if it was registered in the registry instance those read. A file-name
 * string, which assets used to evaluate to, made resolveAssetSource return null.
 *
 * Fixture dimensions (tests-native/fixtures/assets): logo.png 30x20, logo@2x.png
 * 60x40, logo@3x.png 90x60; badge has only @2x (48x32) and @3x (72x48); splash has a
 * generic 12x10, an .ios 14x10 and an .android 16x10 variant; Glyphs.ttf is a font.
 */
import { createRequire } from "node:module";
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react-native";
import { Image, PixelRatio } from "react-native";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import logoImport from "./fixtures/assets/logo.png";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import fontImport from "./fixtures/assets/Glyphs.ttf";

// React Native's own registry, reached the way its resolveAssetSource reaches it
// (RN 0.87+: react-native/asset-registry; earlier: Libraries/Image/AssetRegistry).
const rnRequire = createRequire(import.meta.url);
function registry(): { getAssetByID(id: number): Record<string, unknown> | undefined } {
  try {
    return rnRequire("react-native/asset-registry");
  } catch {
    return rnRequire("react-native/Libraries/Image/AssetRegistry");
  }
}

describe("native engine: Metro-shaped asset modules", () => {
  it("an asset require is a registered numeric id, as Metro's module returns", () => {
    const id = require("./fixtures/assets/logo.png");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    expect(registry().getAssetByID(id)).toMatchObject({ name: "logo", type: "png" });
  });

  it("registers exactly the descriptor Metro writes into the module", () => {
    const asset = registry().getAssetByID(require("./fixtures/assets/logo.png"));
    expect(asset).toEqual({
      __packager_asset: true,
      httpServerLocation: "/assets/tests-native/fixtures/assets",
      width: 30,
      height: 20,
      scales: [1, 2, 3],
      hash: expect.stringMatching(/^[0-9a-f]{32}$/),
      name: "logo",
      type: "png",
    });
  });

  it("Image.resolveAssetSource resolves it with the image's real dimensions", () => {
    // The default device is 3x, so the @3x file next to the bundle (the mock
    // engine's Image.resolveAssetSource pins the same URI).
    expect(PixelRatio.get()).toBe(3);
    expect(Image.resolveAssetSource(require("./fixtures/assets/logo.png"))).toEqual({
      __packager_asset: true,
      width: 30,
      height: 20,
      scale: 3,
      uri: "file:///assets/tests-native/fixtures/assets/logo@3x.png",
    });
  });

  it("an asset with only @2x/@3x variants reports point dimensions and its scales", () => {
    const resolved = Image.resolveAssetSource(require("./fixtures/assets/badge@2x.png"));
    // Metro measures the smallest variant and divides by its scale: 48x32 @2x.
    expect(resolved).toMatchObject({ width: 24, height: 16 });
    const asset = registry().getAssetByID(require("./fixtures/assets/badge@3x.png"));
    expect(asset).toMatchObject({ name: "badge", scales: [2, 3], width: 24, height: 16 });
  });

  it("prefers the platform variant group, as Metro does for the built platform", () => {
    const asset = registry().getAssetByID(require("./fixtures/assets/splash.png"));
    expect(asset).toMatchObject({ name: "splash", width: 14, height: 10, scales: [1] });
  });

  it("a font registers with its type and no dimensions", () => {
    const asset = registry().getAssetByID(require("./fixtures/assets/Glyphs.ttf"));
    expect(asset).toEqual({
      __packager_asset: true,
      httpServerLocation: "/assets/tests-native/fixtures/assets",
      scales: [1],
      hash: expect.stringMatching(/^[0-9a-f]{32}$/),
      name: "Glyphs",
      type: "ttf",
    });
    expect(asset).not.toHaveProperty("width");
  });

  it("an ESM import of the asset is the same id as the require", () => {
    expect(logoImport).toBe(require("./fixtures/assets/logo.png"));
    expect(fontImport).toBe(require("./fixtures/assets/Glyphs.ttf"));
    expect(Image.resolveAssetSource(logoImport)).toMatchObject({ width: 30, height: 20 });
  });

  it("<Image source={require(...)}> renders the resolved asset, as on device", async () => {
    const screen = await render(
      <Image testID="logo" source={require("./fixtures/assets/logo.png")} />,
    );
    // React Native's Image resolves the id itself and hands the host component the
    // resolved source(s).
    const source = [screen.getByTestId("logo").props.source].flat();
    expect(source).toEqual([
      expect.objectContaining({
        __packager_asset: true,
        width: 30,
        height: 20,
        uri: expect.stringMatching(/assets\/tests-native\/fixtures\/assets\/logo(@\dx)?\.png$/),
      }),
    ]);
  });
});
