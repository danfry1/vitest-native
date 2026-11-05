import { it } from "vitest";
import { loadOldExpoModulesCore } from "./expo-sdk-warning.js";

// Order-independent twin of the other expo-sdk-warning file: both warn, and whichever
// runs second asserts the copy's version was not read again.
it("names an unsupported expo-modules-core in each file that loads it", () => {
  loadOldExpoModulesCore();
});
