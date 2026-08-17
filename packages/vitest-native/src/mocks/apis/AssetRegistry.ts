import { vi } from "vitest";

/**
 * AssetRegistry — a top-level export since React Native 0.87 (previously only
 * reachable via `@react-native/assets-registry/registry`). The real module is a
 * process-wide array: `registerAsset` pushes and returns the new length, so the
 * first asset gets id 1 (truthy), and `getAssetByID` reads `assets[id - 1]`.
 * Mirrored exactly, including the 1-based ids, so code that treats an id of 0
 * as "unregistered" behaves the same against the mock.
 */
export function createAssetRegistryMock() {
  const assets: unknown[] = [];
  const mock = {
    registerAsset: vi.fn((asset: unknown) => assets.push(asset)),
    getAssetByID: vi.fn((assetId: number) => assets[assetId - 1]),
    _reset: () => {
      assets.length = 0;
      mock.registerAsset.mockClear();
      mock.getAssetByID.mockClear();
    },
  };
  return mock;
}
