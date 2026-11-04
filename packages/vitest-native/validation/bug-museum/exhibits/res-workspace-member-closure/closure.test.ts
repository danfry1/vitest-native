// museum-ui (a workspace library) re-exports museum-image, which reaches museum-expo as a
// peer; museum-expo loads museum-expo-asset, whose build/ is ES modules with an
// extensionless import, as expo-asset's is.
import { expect, test } from "vitest";
import { assetLoaded } from "museum-ui";

test("a dependency of a workspace library the project depends on is compiled", () => {
  expect(assetLoaded).toBe(true);
});
