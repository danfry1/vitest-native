import { describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import * as RN from "react-native";

function renders(el: React.ReactElement) {
  let tree: any;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree.toJSON();
}
const h = React.createElement;

describe("native engine: core component coverage matrix", () => {
  const cases: [string, () => React.ReactElement][] = [
    ["View", () => h(RN.View, null, h(RN.Text, null, "x"))],
    ["Text", () => h(RN.Text, null, "x")],
    ["Image", () => h(RN.Image, { source: { uri: "x" } })],
    ["TextInput", () => h(RN.TextInput, { value: "x" })],
    ["ScrollView", () => h(RN.ScrollView, null, h(RN.Text, null, "x"))],
    [
      "FlatList",
      () =>
        h(RN.FlatList, {
          data: [1, 2],
          renderItem: ({ item }: any) => h(RN.Text, null, String(item)),
        }),
    ],
    [
      "SectionList",
      () =>
        h(RN.SectionList, {
          sections: [{ title: "s", data: ["a"] }],
          renderItem: ({ item }: any) => h(RN.Text, null, item),
          renderSectionHeader: ({ section }: any) => h(RN.Text, null, section.title),
        }),
    ],
    ["Modal", () => h(RN.Modal, { visible: true }, h(RN.Text, null, "m"))],
    ["Pressable", () => h(RN.Pressable, null, h(RN.Text, null, "p"))],
    ["TouchableOpacity", () => h(RN.TouchableOpacity, null, h(RN.Text, null, "t"))],
    ["TouchableHighlight", () => h(RN.TouchableHighlight, null, h(RN.Text, null, "t"))],
    ["TouchableWithoutFeedback", () => h(RN.TouchableWithoutFeedback, null, h(RN.View, null))],
    ["ActivityIndicator", () => h(RN.ActivityIndicator, null)],
    ["Button", () => h(RN.Button, { title: "b", onPress: () => {} })],
    ["Switch", () => h(RN.Switch, { value: true })],
    [
      "RefreshControl",
      () => h(RN.ScrollView, { refreshControl: h(RN.RefreshControl, { refreshing: false }) }),
    ],
    ["StatusBar", () => h(RN.StatusBar, { hidden: true })],
    ["SafeAreaView", () => h(RN.SafeAreaView, null, h(RN.Text, null, "s"))],
    ["KeyboardAvoidingView", () => h(RN.KeyboardAvoidingView, null, h(RN.Text, null, "k"))],
    [
      "ImageBackground",
      () => h(RN.ImageBackground, { source: { uri: "x" } }, h(RN.Text, null, "i")),
    ],
  ];
  for (const [name, make] of cases) {
    it(`renders ${name}`, () => {
      const warning =
        name === "SafeAreaView" ? vi.spyOn(console, "warn").mockImplementation(() => {}) : null;
      try {
        expect(() => renders(make())).not.toThrow();
      } finally {
        warning?.mockRestore();
      }
    });
  }
});

describe("native engine: core API coverage", () => {
  it("Dimensions.get", () => {
    expect(RN.Dimensions.get("window").width).toBeGreaterThan(0);
  });
  it("PixelRatio.get", () => {
    expect(RN.PixelRatio.get()).toBeGreaterThan(0);
  });
  it("Appearance.getColorScheme", () => {
    expect(["light", "dark", null]).toContain(RN.Appearance.getColorScheme());
  });
  it("I18nManager", () => {
    expect(typeof RN.I18nManager.isRTL).toBe("boolean");
  });
  it("Platform.select default", () => {
    expect(RN.Platform.select({ default: "d" })).toBe("d");
  });
});
