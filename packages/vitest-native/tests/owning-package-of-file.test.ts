// The package a file belongs to: the one after its last node_modules/ (native/match.mjs).
import { describe, expect, it } from "vitest";
import { owningPackageOfFile } from "../src/native/match.mjs";

describe("owningPackageOfFile", () => {
  it("names the package after the last node_modules/, scoped or not", () => {
    expect(owningPackageOfFile("/a/node_modules/react-native-reanimated/src/index.ts")).toBe(
      "react-native-reanimated",
    );
    expect(owningPackageOfFile("/a/node_modules/@scope/pkg/lib/x.js")).toBe("@scope/pkg");
    expect(owningPackageOfFile("C:\\a\\node_modules\\expo\\build\\x.js")).toBe("expo");
  });

  it("gives a package nested in another's node_modules its own name", () => {
    expect(owningPackageOfFile("/a/node_modules/expo/node_modules/expo-asset/build/x.js")).toBe(
      "expo-asset",
    );
  });

  it("is null outside node_modules", () => {
    expect(owningPackageOfFile("/a/src/App.tsx")).toBeNull();
  });
});
