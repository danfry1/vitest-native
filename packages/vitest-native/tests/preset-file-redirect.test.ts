import { describe, expect, it } from "vitest";
import { presetPackageOfFile } from "../src/native/match.mjs";

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
