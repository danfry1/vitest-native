/**
 * The bridge to the Jest resolvers React Native libraries ship (native/jest-resolvers.mjs):
 * the engine asks reanimated's and worklets' own resolvers which extensions a request
 * from their files resolves with, so the libraries decide which files load their JS
 * implementation instead of their native one.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { libraryExtensionsFor } from "../dist/native/jest-resolvers.mjs";
// @ts-expect-error — runtime .mjs
import { extensionsFor } from "../dist/native/resolve.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const dirOf = (pkg: string) => path.dirname(require.resolve(`${pkg}/package.json`));
const ios = extensionsFor("ios");
const withoutNative = ios.filter((ext: string) => !ext.includes("native"));

describe("library Jest resolvers", () => {
  it("narrow a reanimated file's request for one of its JS-in-Jest modules", () => {
    const from = path.join(dirOf("react-native-reanimated"), "src", "index.ts");
    expect(libraryExtensionsFor(root, "./initializers", from, ios)).toEqual(withoutNative);
  });

  it("leave reanimated's other requests to the engine", () => {
    const from = path.join(dirOf("react-native-reanimated"), "src", "index.ts");
    expect(libraryExtensionsFor(root, "./hook", from, ios)).toBeNull();
  });

  it("narrow every request from a worklets file", () => {
    const from = path.join(dirOf("react-native-worklets"), "src", "index.ts");
    expect(libraryExtensionsFor(root, "./initializers/initializers", from, ios)).toEqual(
      withoutNative,
    );
  });

  it("leave an app's requests alone", () => {
    expect(libraryExtensionsFor(root, "./App", path.join(root, "src", "x.ts"), ios)).toBeNull();
  });

  // pnpm names a store directory after the package's peers, so a path can contain a
  // library's name without belonging to it. The resolvers test their basedir by substring.
  describe("in a pnpm store", () => {
    const store = path.join(root, "node_modules", ".pnpm");
    const inStore = (dir: string, pkg: string, file: string) =>
      path.join(store, dir, "node_modules", pkg, file);

    it("leave a package that has worklets as a peer alone", () => {
      const from = inStore(
        "expo-modules-core@58.0.26_react-native-worklets@0.13.0",
        "expo-modules-core",
        "build/index.js",
      );
      expect(libraryExtensionsFor(root, "./NativeViewManagerAdapter", from, ios)).toBeNull();
    });

    it("leave reanimated's other requests to the engine", () => {
      const from = inStore(
        "react-native-reanimated@4.7.1_react-native-worklets@0.13.0",
        "react-native-reanimated",
        "src/index.ts",
      );
      expect(libraryExtensionsFor(root, "./hook", from, ios)).toBeNull();
      expect(libraryExtensionsFor(root, "./initializers", from, ios)).toEqual(withoutNative);
    });

    it("leave a package whose name only starts with worklets' alone", () => {
      const from = inStore(
        "react-native-worklets-core@1.6.2",
        "react-native-worklets-core",
        "src/index.ts",
      );
      expect(libraryExtensionsFor(root, "./NativeWorklets", from, ios)).toBeNull();
    });
  });
});
