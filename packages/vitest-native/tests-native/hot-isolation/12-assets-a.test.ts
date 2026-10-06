import { it } from "vitest";
import { assertAssetIsolation } from "./asset-isolation";

// Order-independent twin of 13-assets-b: see asset-isolation.ts.
it("registers assets into this file's own React Native registry", () => {
  assertAssetIsolation("a", "b");
});
