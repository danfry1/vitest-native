import { describe, it, expect } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { View, Text, StyleSheet, Platform, Animated, FlatList } from "react-native";

describe("engine:native runs REAL react-native", () => {
  it("renders the authentic RCT host tree with real Text props", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(View, null, React.createElement(Text, null, "hello")),
      );
    });
    const json = tree.toJSON();
    expect(json.type).toBe("RCTView");
    expect(json.children[0].type).toBe("RCTText");
    // These props are computed by REAL Text.js, not a hand-written mock:
    expect(json.children[0].props.allowFontScaling).toBe(true);
    expect(JSON.stringify(json)).toContain("hello");
  });

  it("runs real StyleSheet.flatten + Platform", () => {
    const s = StyleSheet.create({ box: { width: 10, height: 20 } });
    expect(StyleSheet.flatten([s.box, { height: 30 }])).toEqual({ width: 10, height: 30 });
    expect(Platform.OS).toBe("ios");
  });

  it("runs real Animated interpolation math", () => {
    const v = new Animated.Value(0);
    const i = v.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
    v.setValue(0.5);
    expect(i.__getValue()).toBe(50);
  });

  it("renders a real FlatList", () => {
    let tree: any;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlatList, {
          data: [{ k: "a" }, { k: "b" }],
          keyExtractor: (entry: any) => entry.k,
          renderItem: ({ item }: any) => React.createElement(Text, null, item.k),
        }),
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("a");
    expect(json).toContain("b");
  });
});
