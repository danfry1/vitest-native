import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import * as RN from "react-native";
import { Dimensions, Platform, StyleSheet } from "react-native";
import { projectContext } from "../src/context.mjs";

const req = createRequire(
  path.join(projectContext()?.projectRoot ?? process.cwd(), "package.json"),
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

  // Each export is read from React Native when it is used, as Jest's Babel output reads
  // `_reactNative.X`: binding them all when the facade loads would run every lazy getter
  // on React Native's index and load its whole module graph for every file (#528).
  it("reads each export from React Native when it is used", () => {
    const node = req("react-native");
    // Not a deprecated member: those were getters before #528 too.
    const name = "ActivityIndicator";
    const original = Object.getOwnPropertyDescriptor(node, name);
    expect(original?.get).toBeTypeOf("function");
    const sentinel = { sentinel: true };
    Object.defineProperty(node, name, {
      configurable: true,
      enumerable: true,
      get: () => sentinel,
    });
    try {
      expect((RN as Record<string, unknown>)[name]).toBe(sentinel);
      expect(Object.keys(RN)).toContain(name);
    } finally {
      Object.defineProperty(node, name, original!);
    }
    expect((RN as Record<string, unknown>)[name]).toBe(node[name]);
  });

  it("exposes the module itself as the default export", () => {
    expect((RN as unknown as { default: unknown }).default).toBe(req("react-native"));
  });
});
