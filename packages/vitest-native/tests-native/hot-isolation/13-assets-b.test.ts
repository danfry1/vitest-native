import { it } from "vitest";
import { assertAssetIsolation } from "./asset-isolation";

// Order-independent twin of 12-assets-a: see asset-isolation.ts.
it("registers assets into this file's own React Native registry", () => {
  assertAssetIsolation("b", "a");
});
