/**
 * A package Node owns is one module, however it is reached. Its `react-native` field and
 * its `main` can name different files; an `import` resolves the first (Vite's main
 * fields, as Metro) and a `require` read the second, so a test and a library requiring
 * the package held separate instances, and state one wrote the other never saw
 * (react-native-worklets: `src/index.ts` and `lib/module/index.js`). A bare require now
 * resolves the `react-native` field too (native/resolve.mjs, resolvePackageMainField).
 */
import { createRequire } from "node:module";
import * as imported from "vn-lib-two-entries";
import * as worklets from "react-native-worklets";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);

it("gives an import and a require of a package the same instance, its React Native build", () => {
  const required = require("vn-lib-two-entries");
  expect(imported.build).toBe("react-native");
  expect(required.build).toBe("react-native");
  expect(required.store).toBe(imported.store);
});

it("gives a library's require of it that instance too", () => {
  const fromLibrary = require("vn-lib-two-entries/consumer.js")();
  expect(fromLibrary.store).toBe(imported.store);
});

it("holds for react-native-worklets, which runs as itself", () => {
  expect(require("react-native-worklets").runOnUI).toBe(worklets.runOnUI);
});
