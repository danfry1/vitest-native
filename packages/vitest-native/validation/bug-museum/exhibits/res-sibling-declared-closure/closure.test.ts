// museum-image reaches museum-expo as a peer, and museum-expo loads museum-expo-asset,
// whose build/ is ES modules with an extensionless import, as expo-asset's is.
import { expect, test } from "vitest";
import { assetLoaded } from "museum-image";

test("a dependency of a package the project reaches through a peer is compiled", () => {
  expect(assetLoaded).toBe(true);
});
