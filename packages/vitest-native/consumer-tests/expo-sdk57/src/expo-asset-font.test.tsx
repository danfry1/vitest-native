/**
 * expo-asset and expo-font run as themselves under the native engine, so they read the
 * assets React Native registered: one asset registry, whichever way it is reached.
 * expo-asset 57 imports @react-native/assets-registry, which React Native requires;
 * the import was a second instance, empty, so every Asset.fromModule threw "Module
 * is missing from the asset registry" and useFonts never loaded.
 */
import { Asset } from "expo-asset";
import * as Font from "expo-font";
import { expect, it } from "vitest";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import icon from "./fixtures/icon.png";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import font from "./fixtures/Placeholder.ttf";

it("resolves a bundled image through expo-asset", async () => {
  const asset = Asset.fromModule(icon);
  expect(asset.name).toBe("icon");
  expect(asset.type).toBe("png");
  await expect(Asset.loadAsync(icon)).resolves.toHaveLength(1);
});

it("loads a bundled font through expo-font", async () => {
  await expect(Font.loadAsync({ Placeholder: font })).resolves.toBeUndefined();
});
