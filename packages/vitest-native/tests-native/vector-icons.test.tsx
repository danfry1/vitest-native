/**
 * Proof: @react-native-vector-icons renders under the native engine via the
 * `vectorIcons` preset. The library's v10 icon sets (here material-icons) are all
 * built on `@react-native-vector-icons/common`, whose dynamic font loader queries
 * the native ExpoFontLoader at import time — which can't exist in Node, so without
 * the preset, importing any icon set throws and the set is wrongly "not available".
 *
 * The preset shadows the single `common` module so `createIconSet(...)` returns a
 * Text-based stub that forwards name/size/color/style/testID. material-icons is a
 * devDependency so this proves auto-detection (via common) + correct shadowing.
 *
 * Surfaced by the @rneui/base bake-off, where every Icon failure traced to this
 * import-time crash.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { MaterialIcons } from "@react-native-vector-icons/material-icons";

describe("@react-native-vector-icons under native engine", () => {
  it("renders an icon set without crashing on the native font loader", () => {
    render(<MaterialIcons name="home" size={24} color="red" testID="home-icon" />);
    expect(screen.getByTestId("home-icon")).toBeTruthy();
  });

  it("forwards size/color/style to the rendered host (queryable like real tests)", () => {
    render(<MaterialIcons name="star" size={32} color="gold" testID="star-icon" />);
    const icon = screen.getByTestId("star-icon");
    // Flattened style carries the size/color the consumer passed.
    expect(icon).toHaveStyle({ fontSize: 32, color: "gold" });
  });

  it("forwards onPress-related props (icon stays a usable element)", () => {
    render(
      <MaterialIcons name="settings" testID="settings-icon" accessibilityLabel="settings" />,
    );
    expect(screen.getByLabelText("settings")).toBeTruthy();
  });
});
