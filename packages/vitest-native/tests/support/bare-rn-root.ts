import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tests-native/fixtures/assets",
);

/**
 * A project root that Expo does not bundle, holding a copy of
 * tests-native/fixtures/assets at the same relative path.
 *
 * This package declares `expo` as a devDependency, so its own root is an Expo project
 * and every asset under it gets Expo's descriptor (native/assets.mjs). A bare React
 * Native project's descriptor is what Metro alone writes, and only a root from which
 * `expo` does not resolve has it. The copy keeps the asset paths relative to the root
 * as they are in this package, so descriptors carry the same server location.
 */
export function bareReactNativeRoot(): { root: string; assets: string; remove(): void } {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-bare-rn-"));
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"bare-rn-app"}');
  const assets = path.join(root, "tests-native", "fixtures", "assets");
  fs.cpSync(FIXTURES, assets, { recursive: true });
  try {
    createRequire(path.join(root, "package.json")).resolve("expo/package.json");
  } catch {
    return { root, assets, remove: () => fs.rmSync(root, { recursive: true, force: true }) };
  }
  fs.rmSync(root, { recursive: true, force: true });
  throw new Error(`expo resolves from ${root}, so it is not a bare React Native root`);
}
