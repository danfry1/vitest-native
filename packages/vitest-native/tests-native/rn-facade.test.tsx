import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import * as RN from "react-native";
import { Dimensions, Platform, StyleSheet } from "react-native";

const req = createRequire(
  path.join(process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd(), "package.json"),
);

// The facade must be indistinguishable from importing React Native directly: same
// objects, same export surface. If it ever diverged, tests would silently exercise
// a different React Native from the one ecosystem packages see.
describe("native engine: react-native facade", () => {
  it("re-exports the same instances Node's graph holds", () => {
    const node = req("react-native");
    expect(Dimensions).toBe(node.Dimensions);
    expect(Platform).toBe(node.Platform);
    expect(StyleSheet).toBe(node.StyleSheet);
  });

  it("covers React Native's whole public export surface", () => {
    const node = req("react-native");
    const missing = Object.keys(node).filter(
      (name) => !(name in RN) && name !== "__vitestNativeRegistry",
    );
    expect(missing).toEqual([]);
  });

  it("exposes the module itself as the default export", () => {
    expect((RN as unknown as { default: unknown }).default).toBe(req("react-native"));
  });
});
