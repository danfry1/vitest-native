import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { Image, Platform } from "react-native";
import { metroAssetDescriptor } from "../src/native/assets.mjs";
import { bareReactNativeRoot } from "../tests/support/bare-rn-root";
import { selectedPlatform } from "./fixtures/platform";
import { marker } from "./fixtures/plat/marker";
import { nativeOnly } from "./fixtures/plat/nativeonly";

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

describe("native engine: Android platform", () => {
  const bare = bareReactNativeRoot();
  afterAll(bare.remove);

  it("loads Android React Native and application modules", () => {
    expect(Platform.OS).toBe("android");
    expect(Platform.select({ ios: "ios", android: "android" })).toBe("android");
    expect(selectedPlatform).toBe("android");
  });

  it("provides Android-shaped platform constants", () => {
    expect(Platform.Version).toBe(34);
    expect(Platform.constants.systemName).toBeUndefined();
    expect(Platform.constants.reactNativeVersion.minor).toBeGreaterThan(0);
  });

  it("registers the .android asset variant", () => {
    // Metro groups `splash.android.png` as the platform variant of `splash.png` when
    // building for Android. This package declares `expo`, so its root is an Expo project
    // and the descriptor is Expo's: Metro's under Expo CLI's publicPath, plus the
    // variant's md5 (@expo/metro-config getAssets.js).
    const md5 = crypto
      .createHash("md5")
      .update(
        fs.readFileSync(
          path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            "fixtures/assets/splash.android.png",
          ),
        ),
      )
      .digest("hex");
    expect(registry().getAssetByID(require("./fixtures/assets/splash.png"))).toEqual({
      __packager_asset: true,
      httpServerLocation: "/assets/?unstable_path=.%2Ftests-native%2Ffixtures%2Fassets",
      width: 16,
      height: 10,
      scales: [1],
      hash: md5,
      name: "splash",
      type: "png",
      fileHashes: [md5],
    });
  });

  it("registers a bare React Native project's .android variant and resolves it as an Android drawable", () => {
    // The descriptor Metro alone writes, for the same fixtures in a bare React Native
    // root; resolveAssetSource then names the density folder and resource (the mock
    // engine's Image.resolveAssetSource pins the same URI).
    const id = registry().registerAsset(
      metroAssetDescriptor(path.join(bare.assets, "splash.png"), {
        projectRoot: bare.root,
        platform: "android",
      }),
    );
    expect(registry().getAssetByID(id)).toMatchObject({ name: "splash", width: 16 });
    expect(Image.resolveAssetSource(id)).toEqual({
      __packager_asset: true,
      width: 16,
      height: 10,
      scale: 1,
      uri: "file:///drawable-mdpi/testsnative_fixtures_assets_splash.png",
    });
  });

  it("prefers the .android variant over .native and the base file", () => {
    // Same fixtures as platform-resolution.test.ts (iOS): proves platform-specific
    // resolution wins over `.native`, which wins over the base, on Android too.
    expect(marker).toBe("android");
    expect(nativeOnly).toBe("native");
  });
});
