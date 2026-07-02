/**
 * Deep (subpath) imports of preset packages must be shadowed like the root
 * import — `import Swipeable from 'react-native-gesture-handler/Swipeable'` is a
 * common real-app pattern, and letting it fall through would load the package's
 * real native runtime (or fail resolution entirely: RNGH 3.x no longer ships a
 * /Swipeable file, so pre-3.x app code only works because of the redirect).
 *
 * JSON subpaths are exempt: `require('pkg/package.json').version` gates must
 * read the real manifest.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
// @ts-expect-error — no type declarations for the deep path (redirected at runtime)
import Swipeable from "react-native-gesture-handler/Swipeable";
import { Swipeable as RootSwipeable } from "react-native-gesture-handler";

describe("preset subpath imports under the native engine", () => {
  it("ESM deep import yields the preset mock's leaf export and renders", async () => {
    expect(Swipeable).toBeTruthy();
    expect(Swipeable).toBe(RootSwipeable);
    await render(
      <Swipeable>
        <Text>row content</Text>
      </Swipeable>,
    );
    expect(screen.getByText("row content")).toBeTruthy();
  });

  // Root and subpath must agree on THIS file's mock instance — under the hot
  // runtime preset mocks are rebuilt per file, so a stale subpath cache would
  // surface here as an identity mismatch (see preset-subpath-cross-file twin).
  it("CJS subpath leaf identity matches the current root mock", () => {
    const viaSubpath = require("react-native-gesture-handler/Swipeable");
    const root = require("react-native-gesture-handler");
    expect(viaSubpath.default).toBe(root.Swipeable);
  });

  // NOTE: utility subpaths (jest-utils, jestSetup, mock, plugin) passing through
  // to the real file is asserted at the resolution layer in
  // tests/native-unit.test.ts. Asserting that the real third-party file then
  // LOADS end-to-end would test the package's own Node compatibility (RNGH
  // 3.0's ESM jest-utils graph fails to load on some environments) — that is
  // not this project's contract, and pass-through was the pre-redirect status
  // quo for these paths.

  it("CJS deep require yields the leaf with interop default, identity-stable", () => {
    const a = require("react-native-gesture-handler/Swipeable");
    const b = require("react-native-gesture-handler/Swipeable");
    expect(a.default).toBeTruthy();
    expect(a.__esModule).toBe(true);
    // Memoized: repeated requires must return the same object (spies/instanceof).
    expect(a).toBe(b);
  });

  it("unknown leaves fall back to the root preset mock", () => {
    const mod = require("react-native-gesture-handler/lib/commonjs/whatever");
    expect(mod.State).toBeDefined();
    expect(mod.GestureHandlerRootView).toBeDefined();
  });

  it("package.json subpath reads the real manifest", () => {
    const pkg = require("react-native-gesture-handler/package.json");
    expect(pkg.name).toBe("react-native-gesture-handler");
    expect(typeof pkg.version).toBe("string");
  });
});
