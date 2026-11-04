// packages/ui (a workspace library, imported through the @ui alias) re-exports museum-image, which reaches museum-expo as a
// peer; museum-expo loads museum-expo-asset, whose build/ is ES modules with an
// extensionless import, as expo-asset's is.
import { expect, test } from "vitest";
import { assetLoaded } from "@ui/index.js";

test("a dependency of a workspace library the project imports through an alias is compiled", () => {
  expect(assetLoaded).toBe(true);
});
