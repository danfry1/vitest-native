import { vi } from "vitest";

/**
 * AssetRegistry — a top-level export since React Native 0.87 (previously only
 * reachable via `@react-native/assets-registry/registry`). The real module is a
 * process-wide array: `registerAsset` pushes and returns the new length, so the
 * first asset gets id 1 (truthy), and `getAssetByID` reads `assets[id - 1]`.
 * Mirrored exactly, including the 1-based ids, so code that treats an id of 0
 * as "unregistered" behaves the same against the mock.
 *
 * Asset modules register here when they are first evaluated — `require('./a.png')`
 * is the id this registry assigned, as with Metro — so `_reset` clears call history
 * but keeps the entries. React Native's registry has no reset either: an id a module
 * handed out stays valid for as long as that module does. Clearing the array would
 * leave every asset imported at the top of a test file unresolvable after the first
 * `resetAllMocks()`, and would let the next registration reuse its id.
 */
export function createAssetRegistryMock() {
  const assets: unknown[] = [];
  const mock = {
    registerAsset: vi.fn((asset: unknown) => assets.push(asset)),
    getAssetByID: vi.fn((assetId: number) => assets[assetId - 1]),
    _reset: () => {
      mock.registerAsset.mockClear();
      mock.getAssetByID.mockClear();
    },
  };
  return mock;
}
