// react-native-gesture-handler is installed but not declared: the app imports it, and
// Node requires it too (as a library's Jest setup or a require() does).
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { GestureDetector } from "react-native-gesture-handler";

it("the required and the imported package are one module", () => {
  const viaNode = createRequire(import.meta.url)("react-native-gesture-handler");
  expect(viaNode.GestureDetector, "one GestureDetector").toBe(GestureDetector);
});
