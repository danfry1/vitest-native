/**
 * Hook conformance tests — verifies useColorScheme and useWindowDimensions
 * work correctly inside React components, which is how real users use them.
 *
 * These hooks are commonly tested via renderHook or by rendering a component
 * that uses them and asserting on the output.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import {
  View,
  Text,
  useColorScheme,
  useWindowDimensions,
  Appearance,
} from "react-native";

// ---------------------------------------------------------------------------
// useColorScheme inside component
// ---------------------------------------------------------------------------

describe("useColorScheme in component (conformance)", () => {
  function ColorSchemeDisplay() {
    const scheme = useColorScheme();
    return <Text testID="scheme">{scheme}</Text>;
  }

  it("returns a valid color scheme", () => {
    render(<ColorSchemeDisplay />);
    const text = screen.getByTestId("scheme");
    expect(["light", "dark"]).toContain(text.props.children);
  });

  it("defaults to 'light'", () => {
    render(<ColorSchemeDisplay />);
    expect(screen.getByTestId("scheme").props.children).toBe("light");
  });
});

// ---------------------------------------------------------------------------
// useWindowDimensions inside component
// ---------------------------------------------------------------------------

describe("useWindowDimensions in component (conformance)", () => {
  function DimensionsDisplay() {
    const { width, height, scale, fontScale } = useWindowDimensions();
    return (
      <View>
        <Text testID="width">{String(width)}</Text>
        <Text testID="height">{String(height)}</Text>
        <Text testID="scale">{String(scale)}</Text>
        <Text testID="fontScale">{String(fontScale)}</Text>
      </View>
    );
  }

  it("returns width and height as numbers", () => {
    render(<DimensionsDisplay />);
    const width = Number(screen.getByTestId("width").props.children);
    const height = Number(screen.getByTestId("height").props.children);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it("returns scale and fontScale", () => {
    render(<DimensionsDisplay />);
    const scale = Number(screen.getByTestId("scale").props.children);
    const fontScale = Number(screen.getByTestId("fontScale").props.children);
    expect(scale).toBeGreaterThan(0);
    expect(fontScale).toBeGreaterThan(0);
  });

  it("returns default dimensions (390x844)", () => {
    render(<DimensionsDisplay />);
    expect(screen.getByTestId("width").props.children).toBe("390");
    expect(screen.getByTestId("height").props.children).toBe("844");
  });
});

// ---------------------------------------------------------------------------
// Component using multiple hooks together
// ---------------------------------------------------------------------------

describe("Combined hooks in component (conformance)", () => {
  function AppContainer() {
    const scheme = useColorScheme();
    const { width } = useWindowDimensions();
    const isNarrow = width < 400;
    return (
      <View
        testID="container"
        style={{
          backgroundColor: scheme === "dark" ? "#000" : "#fff",
          flexDirection: isNarrow ? "column" : "row",
        }}
      >
        <Text testID="info">{`${scheme}-${isNarrow ? "narrow" : "wide"}`}</Text>
      </View>
    );
  }

  it("renders with hook values", () => {
    render(<AppContainer />);
    expect(screen.getByTestId("info").props.children).toBe("light-narrow");
  });

  it("container has correct background", () => {
    render(<AppContainer />);
    expect(screen.getByTestId("container").props.style).toEqual(
      expect.objectContaining({ backgroundColor: "#fff" }),
    );
  });
});
