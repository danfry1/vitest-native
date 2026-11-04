/**
 * Mock engine: asset imports evaluate to an id in the mock's AssetRegistry, carrying
 * the descriptor Metro would register (see tests/metro-assets-oracle.test.ts), and
 * the mock's Image.resolveAssetSource resolves it the way React Native's
 * AssetSourceResolver does on a test run (no dev server, no bundle URL).
 *
 * This package declares `expo`, so its root is an Expo project and an import here
 * carries Expo's descriptor. Resolution is checked on the descriptor Metro alone
 * writes, for the same fixtures in a bare React Native root (support/bare-rn-root).
 *
 * Fixtures: tests-native/fixtures/assets — logo.png 30x20 with @2x/@3x variants;
 * badge with only @2x (48x32) and @3x; Glyphs.ttf a font.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { AssetRegistry, Image, PixelRatio } from "react-native";
import { resetAllMocks, setDimensions, setPlatform } from "vitest-native/helpers";
import { metroAssetDescriptor } from "../src/native/assets.mjs";
import { bareReactNativeRoot } from "./support/bare-rn-root";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import logo from "../tests-native/fixtures/assets/logo.png";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import badge from "../tests-native/fixtures/assets/badge@2x.png";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import font from "../tests-native/fixtures/assets/Glyphs.ttf";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests-native/fixtures/assets",
);
const md5 = (name: string) =>
  crypto
    .createHash("md5")
    .update(fs.readFileSync(path.join(FIXTURES, name)))
    .digest("hex");

describe("mock engine: Metro-shaped asset modules", () => {
  it("an asset import is an id registered in the mock AssetRegistry", () => {
    expect(typeof logo).toBe("number");
    // Expo's descriptor: Metro's under Expo CLI's publicPath, the path URL-encoded,
    // plus one md5 per scale variant (@expo/metro-config getAssets.js).
    expect(AssetRegistry.getAssetByID(logo)).toEqual({
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
    // Metro measures the smallest variant and divides by its scale: 48x32 @2x.
    expect(AssetRegistry.getAssetByID(badge)).toMatchObject({
      name: "badge",
      scales: [2, 3],
      width: 24,
      height: 16,
    });
  });

  it("a font registers with its type and no dimensions", () => {
    const asset = AssetRegistry.getAssetByID(font);
    expect(asset).toMatchObject({ name: "Glyphs", type: "ttf", scales: [1] });
    expect(asset).not.toHaveProperty("width");
  });

  it("ids stay valid across resetAllMocks", () => {
    resetAllMocks();
    expect(Image.resolveAssetSource(logo)).toMatchObject({ width: 30, height: 20 });
  });
});

describe("mock engine: assets of a bare React Native project", () => {
  const bare = bareReactNativeRoot();
  afterAll(bare.remove);
  const register = (name: string) =>
    AssetRegistry.registerAsset(
      metroAssetDescriptor(path.join(bare.assets, name), {
        projectRoot: bare.root,
        platform: "ios",
      }),
    );
  const bareLogo = register("logo.png");
  const bareBadge = register("badge@2x.png");

  it("registers Metro's descriptor", () => {
    expect(AssetRegistry.getAssetByID(bareLogo)).toEqual({
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

  it("Image.resolveAssetSource resolves it as React Native does on iOS", () => {
    expect(PixelRatio.get()).toBe(3);
    expect(Image.resolveAssetSource(bareLogo)).toEqual({
      __packager_asset: true,
      width: 30,
      height: 20,
      uri: "file:///assets/tests-native/fixtures/assets/logo@3x.png",
      scale: 3,
    });
  });

  it("picks the scale for the device's pixel ratio", () => {
    setDimensions({ width: 375, height: 667, scale: 2, fontScale: 1 });
    try {
      expect(Image.resolveAssetSource(bareBadge)).toMatchObject({
        width: 24,
        height: 16,
        scale: 2,
        uri: "file:///assets/tests-native/fixtures/assets/badge@2x.png",
      });
    } finally {
      resetAllMocks();
    }
  });

  it("resolves the Android drawable as React Native does", () => {
    setPlatform("android");
    try {
      expect(Image.resolveAssetSource(bareLogo)).toMatchObject({
        uri: "file:///drawable-xxhdpi/testsnative_fixtures_assets_logo.png",
      });
    } finally {
      resetAllMocks();
    }
  });
});
