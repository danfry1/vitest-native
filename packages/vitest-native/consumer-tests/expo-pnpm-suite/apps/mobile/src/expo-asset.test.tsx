/**
 * expo-asset, which the app does not declare, reached through expo's own dependency on
 * it. Its build/Asset.fx side-effect module is the file an uncompiled transitive Expo
 * package fails on.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

it("loads expo-asset through expo, which declares it", () => {
  const expoDir = path.dirname(require.resolve("expo/package.json"));
  const fromExpo = createRequire(path.join(expoDir, "package.json"));
  const { Asset } = fromExpo("expo-asset");
  const asset = Asset.fromModule(require("./fixtures/icon.png"));
  expect(asset).toMatchObject({ name: "icon", type: "png" });
});
