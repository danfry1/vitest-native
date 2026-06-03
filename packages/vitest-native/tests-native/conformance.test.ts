import { describe, it, expect } from "vitest";
import { StyleSheet, Platform } from "react-native";

// Mirrors react-native's own StyleSheet/Platform expectations, run against REAL RN.
describe("native-engine conformance (real RN)", () => {
  it("StyleSheet.flatten merges in order", () => {
    expect(StyleSheet.flatten([{ a: 1 }, { a: 2, b: 3 }])).toEqual({ a: 2, b: 3 });
  });

  it("StyleSheet.create + compose round-trips through flatten", () => {
    const s = StyleSheet.create({ x: { margin: 1 }, y: { padding: 2 } });
    expect(StyleSheet.flatten(StyleSheet.compose(s.x, s.y))).toEqual({ margin: 1, padding: 2 });
  });

  it("Platform.select returns the ios branch", () => {
    expect(Platform.select({ ios: "i", android: "a", default: "d" })).toBe("i");
  });

  it("Platform.constants exposes a reactNativeVersion", () => {
    expect(typeof Platform.constants.reactNativeVersion.minor).toBe("number");
  });
});
