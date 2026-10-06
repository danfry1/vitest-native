import { createRequire } from "node:module";
import { expect } from "vitest";
import { Image } from "react-native";

const req = createRequire(import.meta.url);

/**
 * React Native's asset registry is a module-level array, and asset modules register
 * into it when they are evaluated (Metro's `registerAsset` call). Under the hot
 * runtime one worker runs many files, so two things must hold for every file:
 *
 *   - the ids a file's asset requires return resolve through Image.resolveAssetSource
 *     in THAT file — they registered into the registry instance React Native reads,
 *     not into one left over from a previous file;
 *   - nothing another file registered is visible — otherwise ids, and snapshots
 *     containing them, would depend on which files ran earlier in the worker.
 *
 * Each twin registers a sentinel and asserts the other's is absent, so whichever
 * runs second fails if registry state leaked.
 */
export function assertAssetIsolation(self: string, other: string): void {
  const logo = req("../fixtures/assets/logo.png");
  expect(Image.resolveAssetSource(logo)).toMatchObject({ width: 30, height: 20 });

  const registry = registryModule();
  const names: unknown[] = [];
  for (let id = 1; registry.getAssetByID(id) !== undefined; id++) {
    names.push(registry.getAssetByID(id)?.name);
  }
  expect(names).not.toContain(`sentinel-${other}`);
  expect(names).toContain("logo");
  registry.registerAsset({ name: `sentinel-${self}` });
}

function registryModule(): {
  getAssetByID(id: number): { name?: string } | undefined;
  registerAsset(asset: object): number;
} {
  try {
    return req("react-native/asset-registry");
  } catch {
    return req("react-native/Libraries/Image/AssetRegistry");
  }
}
