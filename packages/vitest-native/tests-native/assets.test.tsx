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
 * This package declares `expo`, so its root is an Expo project and an asset required
 * here carries Expo's descriptor. Resolution is checked on the descriptor Metro alone
 * writes, for the same fixtures in a bare React Native root
 * (tests/support/bare-rn-root), registered in the same registry.
 *
 * Fixture dimensions (tests-native/fixtures/assets): logo.png 30x20, logo@2x.png
 * 60x40, logo@3x.png 90x60; badge has only @2x (48x32) and @3x (72x48); splash has a
 * generic 12x10, an .ios 14x10 and an .android 16x10 variant; Glyphs.ttf is a font.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { afterAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react-native";
import { Image, PixelRatio } from "react-native";
import { metroAssetDescriptor } from "../src/native/assets.mjs";
import { bareReactNativeRoot } from "../tests/support/bare-rn-root";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import logoImport from "./fixtures/assets/logo.png";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import fontImport from "./fixtures/assets/Glyphs.ttf";

// React Native's own registry, reached the way its resolveAssetSource reaches it
// (RN 0.87+: react-native/asset-registry; earlier: Libraries/Image/AssetRegistry).
const rnRequire = createRequire(import.meta.url);
function registry(): {
  getAssetByID(id: number): Record<string, unknown> | undefined;
  registerAsset(asset: unknown): number;
} {
  try {
    return rnRequire("react-native/asset-registry");
  } catch {
    return rnRequire("react-native/Libraries/Image/AssetRegistry");
  }
}

const md5 = (name: string) =>
  crypto
    .createHash("md5")
    .update(
      fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/assets", name),
      ),
    )
    .digest("hex");

describe("native engine: Metro-shaped asset modules", () => {
  it("an asset require is a registered numeric id, as Metro's module returns", () => {
    const id = require("./fixtures/assets/logo.png");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    expect(registry().getAssetByID(id)).toMatchObject({ name: "logo", type: "png" });
  });

  it("registers exactly the descriptor Metro writes into the module", () => {
    // Expo's: Metro's under Expo CLI's publicPath, the path URL-encoded, plus one md5
    // per scale variant (@expo/metro-config getAssets.js).
    const asset = registry().getAssetByID(require("./fixtures/assets/logo.png"));
    expect(asset).toEqual({
      __packager_asset: true,
      httpServerLocation: "/assets/?unstable_path=.%2Ftests-native%2Ffixtures%2Fassets",
      width: 30,
      height: 20,
      scales: [1, 2, 3],
      hash: expect.stringMatching(/^[0-9a-f]{32}$/),
      name: "logo",
      type: "png",
      fileHashes: [md5("logo.png"), md5("logo@2x.png"), md5("logo@3x.png")],
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
      httpServerLocation: "/assets/?unstable_path=.%2Ftests-native%2Ffixtures%2Fassets",
      scales: [1],
      hash: expect.stringMatching(/^[0-9a-f]{32}$/),
      name: "Glyphs",
      type: "ttf",
      fileHashes: [md5("Glyphs.ttf")],
    });
    expect(asset).not.toHaveProperty("width");
  });

  // An Android vector drawable, as expo-router's Android toolbar requires one: Metro's
  // default assetExts include `xml`, so it is an asset, not JavaScript to compile.
  it("an .xml file in Metro's default assetExts registers as an asset", () => {
    const asset = registry().getAssetByID(require("./fixtures/assets/arrow_right.xml"));
    expect(asset).toMatchObject({ __packager_asset: true, name: "arrow_right", type: "xml" });
  });

  it("an ESM import of the asset is the same id as the require", () => {
    expect(logoImport).toBe(require("./fixtures/assets/logo.png"));
    expect(fontImport).toBe(require("./fixtures/assets/Glyphs.ttf"));
    expect(Image.resolveAssetSource(logoImport)).toMatchObject({ width: 30, height: 20 });
  });
});

describe("native engine: assets of a bare React Native project", () => {
  const bare = bareReactNativeRoot();
  afterAll(bare.remove);
  const logo = registry().registerAsset(
    metroAssetDescriptor(path.join(bare.assets, "logo.png"), {
      projectRoot: bare.root,
      platform: "ios",
    }),
  );

  it("registers Metro's descriptor", () => {
    expect(registry().getAssetByID(logo)).toEqual({
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
    expect(Image.resolveAssetSource(logo)).toEqual({
      __packager_asset: true,
      width: 30,
      height: 20,
      scale: 3,
      uri: "file:///assets/tests-native/fixtures/assets/logo@3x.png",
    });
  });

  it("<Image source={asset}> renders the resolved asset, as on device", async () => {
    const screen = await render(<Image testID="logo" source={logo} />);
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
