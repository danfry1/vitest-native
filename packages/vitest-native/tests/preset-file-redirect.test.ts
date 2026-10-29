import { describe, expect, it } from "vitest";
import { presetPackageOfFile, requestForPackageFile } from "../src/native/match.mjs";

// A CommonJS module the native loader compiled reaches its `require`s as resolved file
// URLs, not bare names. presetPackageOfFile maps such a file back to the preset package
// that owns it, so the redirect applies on that path too.
const presets = new Set(["expo-asset", "@react-native-async-storage/async-storage"]);
const isPreset = (pkg: string) => presets.has(pkg);

describe("presetPackageOfFile", () => {
  it("maps a file inside a preset package to the package and subpath", () => {
    expect(
      presetPackageOfFile(
        "/app/node_modules/expo-asset/build/index.js",
        "/app/node_modules/expo/src/Expo.fx.tsx",
        isPreset,
      ),
    ).toEqual({ pkg: "expo-asset", subpath: "build/index.js" });
  });

  it("handles scoped packages", () => {
    expect(
      presetPackageOfFile(
        "/app/node_modules/@react-native-async-storage/async-storage/lib/commonjs/index.js",
        "/app/src/storage.ts",
        isPreset,
      ),
    ).toEqual({
      pkg: "@react-native-async-storage/async-storage",
      subpath: "lib/commonjs/index.js",
    });
  });

  it("uses the innermost node_modules (pnpm's nested layout)", () => {
    expect(
      presetPackageOfFile(
        "/app/node_modules/.pnpm/expo-asset@57.0.1/node_modules/expo-asset/build/index.js",
        "/app/node_modules/.pnpm/expo@57.0.24/node_modules/expo/src/Expo.fx.tsx",
        isPreset,
      ),
    ).toEqual({ pkg: "expo-asset", subpath: "build/index.js" });
  });

  it("leaves a preset package's own internal requires alone", () => {
    expect(
      presetPackageOfFile(
        "/app/node_modules/expo-asset/build/Asset.js",
        "/app/node_modules/expo-asset/build/index.js",
        isPreset,
      ),
    ).toBeNull();
  });

  it("does not treat a same-prefix sibling package as internal", () => {
    expect(
      presetPackageOfFile(
        "/app/node_modules/expo-asset/build/index.js",
        "/app/node_modules/expo-asset-utils/index.js",
        isPreset,
      ),
    ).toEqual({ pkg: "expo-asset", subpath: "build/index.js" });
  });

  it("ignores packages without a preset and files outside node_modules", () => {
    expect(
      presetPackageOfFile("/app/node_modules/expo/src/Expo.ts", "/app/src/a.ts", isPreset),
    ).toBeNull();
    expect(presetPackageOfFile("/app/src/expo-asset/index.ts", null, isPreset)).toBeNull();
  });

  it("normalises Windows separators", () => {
    expect(
      presetPackageOfFile(
        "C:\\app\\node_modules\\expo-asset\\build\\index.js",
        "C:\\app\\node_modules\\expo\\src\\Expo.fx.tsx",
        isPreset,
      ),
    ).toEqual({ pkg: "expo-asset", subpath: "build/index.js" });
  });
});

// Only the resolved file reaches the loader on that path; the request is recovered from
// the package's manifest so the redirect's exemptions see what the caller wrote.
describe("requestForPackageFile", () => {
  it("maps a conditional exports target back to its subpath key", () => {
    const manifest = {
      exports: {
        ".": { import: "./lib/module/index.js", require: "./lib/commonjs/index.js" },
        "./jest-utils": { require: "./lib/commonjs/jestUtils/index.js" },
      },
    };
    expect(requestForPackageFile("rngh", "lib/commonjs/jestUtils/index.js", manifest)).toBe(
      "rngh/jest-utils",
    );
    expect(requestForPackageFile("rngh", "lib/module/index.js", manifest)).toBe("rngh");
  });

  it("recognises an ES-module-only entry", () => {
    const manifest = { type: "module", exports: { ".": { import: "./dist/index.mjs" } } };
    expect(requestForPackageFile("esm-only", "dist/index.mjs", manifest)).toBe("esm-only");
    expect(
      requestForPackageFile("esm-only", "dist/index.mjs", { exports: "./dist/index.mjs" }),
    ).toBe("esm-only");
  });

  it("maps a wildcard subpath pattern", () => {
    const manifest = { exports: { ".": "./dist/index.js", "./*": "./dist/*.js" } };
    expect(requestForPackageFile("pkg", "dist/Swipeable.js", manifest)).toBe("pkg/Swipeable");
    expect(
      requestForPackageFile("pkg", "lib/a.b.js", { exports: { "./sub/*": "./lib/*.js" } }),
    ).toBe("pkg/sub/a.b");
  });

  it("treats every `*` in a target as the same value, as Node does", () => {
    const manifest = { exports: { "./*": "./dist/*/index/*.js" } };
    expect(requestForPackageFile("pkg", "dist/Button/index/Button.js", manifest)).toBe(
      "pkg/Button",
    );
    // Different values for the two stars: not this pattern, so the path is used.
    expect(requestForPackageFile("pkg", "dist/Button/index/Other.js", manifest)).toBe(
      "pkg/dist/Button/index/Other",
    );
  });

  it("uses main, module and react-native entries, with or without an extension", () => {
    expect(requestForPackageFile("pkg", "lib/index.js", { main: "lib/index" })).toBe("pkg");
    expect(requestForPackageFile("pkg", "src/index.ts", { "react-native": "src/index.ts" })).toBe(
      "pkg",
    );
  });

  it("reads an index file as its directory, so utility entries keep their name", () => {
    // react-native-reanimated/plugin resolves to plugin/index.js: the exemption for
    // `plugin` must still apply.
    expect(requestForPackageFile("rea", "plugin/index.js", { main: "lib/index.js" })).toBe(
      "rea/plugin",
    );
    expect(requestForPackageFile("pkg", "build/Asset.js", { main: "build/index.js" })).toBe(
      "pkg/build/Asset",
    );
  });
});
