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
import { projectContext } from "../src/context.mjs";

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

const ownership = Boolean(projectContext()?.ownershipModel);

it.skipIf(ownership)(
  "leaves a package the hooks do not compile on its main, which Node loads as it is",
  () => {
    // Its react-native field is JSX: following it would turn a working require into a
    // SyntaxError.
    expect(require("vn-lib-plain-two-entries").entry).toBe("main");
  },
);

it.runIf(ownership)(
  "under experimental.ownershipModel, compiles that package and gives both sides one instance of its field",
  async () => {
    // The shared resolver follows the react-native field on both module systems, as Metro
    // does, so the package joins the compile selection (ecosystem.ts,
    // compileReactNativeFieldSource) instead of loading raw.
    const plainImported = await import("vn-lib-plain-two-entries");
    const required = require("vn-lib-plain-two-entries");
    expect(plainImported.entry).toBe("react-native");
    expect(required.entry).toBe("react-native");
    // The default export is an object the module creates: the same one on both sides
    // only if they share one module instance.
    expect(required.default).toBe(plainImported.default);
  },
);

it("leaves require.resolve with paths to Node", () => {
  const resolved = require.resolve("vn-lib-two-entries", { paths: [process.cwd()] });
  expect(resolved.replace(/\\/g, "/")).toMatch(/\/lib\/index\.js$/);
});
