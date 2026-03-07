import { describe, it, expect } from "vitest";
import { Platform, Dimensions, StyleSheet, PixelRatio } from "react-native";

describe("Platform", () => {
  it("has default OS", () => {
    expect(Platform.OS).toBe("ios");
  });

  it("has select", () => {
    expect(Platform.select({ ios: "a", android: "b" })).toBe("a");
  });

  it("has version", () => {
    expect(Platform.Version).toBe("17.0");
  });
});

describe("Dimensions", () => {
  it("returns window dimensions", () => {
    const dims = Dimensions.get("window");
    expect(dims.width).toBe(390);
    expect(dims.height).toBe(844);
    expect(dims.scale).toBe(3);
  });
});

describe("StyleSheet", () => {
  it("creates styles", () => {
    const styles = StyleSheet.create({
      container: { flex: 1 },
      text: { fontSize: 16 },
    });
    expect(styles.container).toBeDefined();
    expect(styles.text).toBeDefined();
  });

  it("flattens styles", () => {
    const result = StyleSheet.flatten([{ flex: 1 }, { color: "red" }]);
    expect(result).toEqual({ flex: 1, color: "red" });
  });
});

describe("PixelRatio", () => {
  it("returns scale", () => {
    expect(PixelRatio.get()).toBe(3);
  });

  it("returns font scale", () => {
    expect(PixelRatio.getFontScale()).toBe(1);
  });
});
