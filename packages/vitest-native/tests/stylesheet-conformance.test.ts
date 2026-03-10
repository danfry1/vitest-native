/**
 * StyleSheet conformance tests — ported from React Native's own test suite.
 *
 * Sources:
 * - Libraries/StyleSheet/__tests__/flattenStyle-test.js
 * - Libraries/StyleSheet/__tests__/StyleSheet-test.js
 */

import { describe, it, expect } from "vitest";
import { StyleSheet } from "react-native";

// ---------------------------------------------------------------------------
// flattenStyle — ported from Libraries/StyleSheet/__tests__/flattenStyle-test.js
// ---------------------------------------------------------------------------

describe("StyleSheet.flatten (conformance with RN)", () => {
  it("should merge style objects", () => {
    const style1 = { width: 10 };
    const style2 = { height: 20 };
    const flatStyle = StyleSheet.flatten([style1, style2]);
    expect(flatStyle?.width).toBe(10);
    expect(flatStyle?.height).toBe(20);
  });

  it("should override style properties", () => {
    const style1 = { backgroundColor: "#000", width: 10 };
    const style2 = { backgroundColor: "#023c69", width: null };
    const flatStyle = StyleSheet.flatten([style1, style2]);
    expect(flatStyle?.backgroundColor).toBe("#023c69");
    expect(flatStyle?.width).toBe(null);
  });

  it("should overwrite properties with undefined", () => {
    const style1 = { backgroundColor: "#000" };
    const style2 = { backgroundColor: undefined };
    const flatStyle = StyleSheet.flatten([style1, style2]);
    expect(flatStyle?.backgroundColor).toBe(undefined);
  });

  it("should not fail on falsy values", () => {
    expect(() => StyleSheet.flatten([null, false, undefined])).not.toThrow();
  });

  it("should recursively flatten arrays", () => {
    const style1 = { width: 10 };
    const style2 = { height: 20 };
    const style3 = { width: 30 };
    const flatStyle = StyleSheet.flatten([null, [], [style1, style2], style3]);
    expect(flatStyle?.width).toBe(30);
    expect(flatStyle?.height).toBe(20);
  });

  it("should not allocate an object when there is no style", () => {
    const nullStyle = StyleSheet.flatten(null);
    expect(nullStyle).toBe(undefined);
  });

  it("should not allocate an object when there is a single style", () => {
    const style = { a: "b" };
    const flattened = StyleSheet.flatten(style);
    expect(flattened).toBe(style);
  });

  it("should not allocate an object when there is a single class", () => {
    const styles = StyleSheet.create({
      elementA: {
        styleA: "moduleA/elementA/styleA",
        styleB: "moduleA/elementA/styleB",
      },
    } as any);
    const singleStyle = StyleSheet.flatten(styles.elementA);
    const singleStyleAgain = StyleSheet.flatten(styles.elementA);
    expect(singleStyle).toBe(singleStyleAgain);
  });

  it("should merge single class and style properly", () => {
    const fixture = StyleSheet.create({
      elementA: {
        styleA: "moduleA/elementA/styleA",
        styleB: "moduleA/elementA/styleB",
      },
    } as any);
    const style = { styleA: "overrideA", styleC: "overrideC" };
    const arrayStyle = StyleSheet.flatten([fixture.elementA, style]);
    expect(arrayStyle).toEqual({
      styleA: "overrideA",
      styleB: "moduleA/elementA/styleB",
      styleC: "overrideC",
    });
  });

  it("should merge multiple classes", () => {
    const fixture = StyleSheet.create({
      elementA: {
        styleA: "moduleA/elementA/styleA",
        styleB: "moduleA/elementA/styleB",
      },
      elementB: {
        styleB: "moduleA/elementB/styleB",
      },
    } as any);

    const AthenB = StyleSheet.flatten([fixture.elementA, fixture.elementB]);
    const BthenA = StyleSheet.flatten([fixture.elementB, fixture.elementA]);

    expect(AthenB).toEqual({
      styleA: "moduleA/elementA/styleA",
      styleB: "moduleA/elementB/styleB",
    });
    expect(BthenA).toEqual({
      styleA: "moduleA/elementA/styleA",
      styleB: "moduleA/elementA/styleB",
    });
  });

  it("should merge multiple classes with style override", () => {
    const fixture = StyleSheet.create({
      elementA: {
        styleA: "moduleA/elementA/styleA",
        styleB: "moduleA/elementA/styleB",
      },
      elementB: {
        styleB: "moduleA/elementB/styleB",
      },
    } as any);

    const style = { styleA: "overrideA" };
    const AthenB = StyleSheet.flatten([fixture.elementA, fixture.elementB, style]);
    const BthenA = StyleSheet.flatten([fixture.elementB, fixture.elementA, style]);

    expect(AthenB).toEqual({
      styleA: "overrideA",
      styleB: "moduleA/elementB/styleB",
    });
    expect(BthenA).toEqual({
      styleA: "overrideA",
      styleB: "moduleA/elementA/styleB",
    });
  });

  it("should flatten recursively with nested arrays", () => {
    const fixture = StyleSheet.create({
      elementA: {
        styleA: "moduleA/elementA/styleA",
        styleB: "moduleA/elementA/styleB",
      },
      elementB: {
        styleB: "moduleA/elementB/styleB",
      },
    } as any);

    const style = [{ styleA: "newA", styleB: "newB" }, { styleA: "newA2" }];
    const result = StyleSheet.flatten([fixture.elementA, fixture.elementB, style]);
    expect(result).toEqual({
      styleA: "newA2",
      styleB: "newB",
    });
  });
});

// ---------------------------------------------------------------------------
// StyleSheet.create — conformance
// ---------------------------------------------------------------------------

describe("StyleSheet.create (conformance)", () => {
  it("returns the same style objects", () => {
    const styles = StyleSheet.create({
      container: { flex: 1 },
      text: { fontSize: 16 },
    });
    expect(styles.container).toEqual({ flex: 1 });
    expect(styles.text).toEqual({ fontSize: 16 });
  });

  it("preserves all style properties", () => {
    const styles = StyleSheet.create({
      box: {
        backgroundColor: "red",
        padding: 10,
        margin: 5,
        borderRadius: 8,
      },
    });
    expect(styles.box).toEqual({
      backgroundColor: "red",
      padding: 10,
      margin: 5,
      borderRadius: 8,
    });
  });
});

// ---------------------------------------------------------------------------
// StyleSheet.compose — conformance
// ---------------------------------------------------------------------------

describe("StyleSheet.compose (conformance)", () => {
  it("returns array of two styles", () => {
    const a = { flex: 1 };
    const b = { color: "red" };
    expect(StyleSheet.compose(a, b)).toEqual([a, b]);
  });

  it("can be flattened", () => {
    const a = { flex: 1, backgroundColor: "blue" };
    const b = { flex: 2, color: "red" };
    const composed = StyleSheet.compose(a, b);
    const flat = StyleSheet.flatten(composed);
    expect(flat).toEqual({ flex: 2, backgroundColor: "blue", color: "red" });
  });
});

// ---------------------------------------------------------------------------
// StyleSheet constants — conformance
// ---------------------------------------------------------------------------

describe("StyleSheet constants (conformance)", () => {
  it("absoluteFill has correct shape", () => {
    expect(StyleSheet.absoluteFill).toEqual({
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });

  it("absoluteFillObject has correct shape", () => {
    expect(StyleSheet.absoluteFillObject).toEqual({
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });

  it("hairlineWidth is a positive number ≤ 1", () => {
    expect(StyleSheet.hairlineWidth).toBeGreaterThan(0);
    expect(StyleSheet.hairlineWidth).toBeLessThanOrEqual(1);
  });

  it("setStyleAttributePreprocessor is a function", () => {
    expect(typeof StyleSheet.setStyleAttributePreprocessor).toBe("function");
  });
});
