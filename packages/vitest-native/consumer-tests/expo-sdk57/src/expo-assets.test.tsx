/**
 * In a project Expo bundles, an asset registers the descriptor Expo's transform
 * worker registers: Metro's, under Expo CLI's dev publicPath, plus `fileHashes`.
 * The oracle is Expo's own function (@expo/metro-config
 * build/transform-worker/getAssets.js getUniversalAssetData), from the installed
 * Expo, passed through the key removal Metro's generateAssetCodeFileAst applies.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
// @ts-expect-error - asset imports are provided by the Vite plugin.
import icon from "./fixtures/icon.png";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRequire = createRequire(path.join(root, "package.json"));

it("registers the descriptor Expo's bundler registers", async () => {
  const expoRequire = createRequire(projectRequire.resolve("expo/package.json"));
  const { getUniversalAssetData } = expoRequire(
    "@expo/metro-config/build/transform-worker/getAssets",
  );
  const file = path.join(here, "fixtures", "icon.png");
  const data = await getUniversalAssetData(
    file,
    path.relative(root, file),
    [],
    "ios",
    // Expo CLI's dev server (build/src/start/server/metro/instantiateMetro.js).
    "/assets/?unstable_path=.",
  );
  const { files: _files, fileSystemLocation: _location, path: _path, ...registered } = data;
  expect(registered.fileHashes).toHaveLength(2);
  const { getAssetByID } = projectRequire("react-native/Libraries/Image/AssetRegistry");
  expect(getAssetByID(icon)).toEqual(registered);
});
