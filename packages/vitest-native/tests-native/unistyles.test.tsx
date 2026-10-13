/**
 * react-native-unistyles under the native engine, zero-config: the package is
 * installed (a devDependency), so its preset is auto-detected and shadows it, while
 * the component renders through real React Native.
 *
 * Unistyles 3 resolves styles in C++ via Nitro and cannot load in Node; importing it
 * here proves the preset, not the real package, answered.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";
import { createRequire } from "node:module";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import { useAnimatedTheme } from "react-native-unistyles/reanimated";

const themes = {
  light: { colors: { surface: "#ffffff", accent: "#0055ff" } },
  dark: { colors: { surface: "#000000", accent: "#66aaff" } },
};

// As an app's unistyles.ts does, before any StyleSheet.create().
StyleSheet.configure({ themes, settings: { initialTheme: "light" } } as any);

const styles = StyleSheet.create((theme: any) => ({
  card: {
    backgroundColor: theme.colors.surface,
    padding: 8,
    variants: { size: { small: { padding: 4 }, large: { padding: 16 } } },
  },
}));

function Card({ size, label }: { size: "small" | "large"; label: string }) {
  (styles as any).useVariants({ size });
  const { theme } = useUnistyles() as any;
  return (
    <View testID="card" style={(styles as any).card}>
      <Text style={{ color: theme.colors.accent }}>{label}</Text>
    </View>
  );
}

describe("react-native-unistyles (preset, native engine)", () => {
  it("renders with the theme and the selected variant", async () => {
    await render(<Card size="large" label="Hello" />);
    expect(screen.getByTestId("card")).toHaveStyle({ backgroundColor: "#ffffff", padding: 16 });
    expect(screen.getByText("Hello")).toHaveStyle({ color: "#0055ff" });
  });

  it("shows a theme switch on the next render", async () => {
    UnistylesRuntime.setTheme("dark" as any);
    await render(<Card size="small" label="Dark" />);
    expect(screen.getByTestId("card")).toHaveStyle({ backgroundColor: "#000000", padding: 4 });
    expect(screen.getByText("Dark")).toHaveStyle({ color: "#66aaff" });
  });

  it("re-renders a component that uses useUnistyles() when the theme is toggled", async () => {
    UnistylesRuntime.setTheme("light" as any);
    function Toggle() {
      const { theme } = useUnistyles() as any;
      return (
        <Pressable testID="toggle" onPress={() => UnistylesRuntime.setTheme("dark" as any)}>
          <View testID="toggle-card" style={(styles as any).card} />
          <Text style={{ color: theme.colors.accent }}>Toggle</Text>
        </Pressable>
      );
    }
    await render(<Toggle />);
    expect(screen.getByText("Toggle")).toHaveStyle({ color: "#0055ff" });
    await act(async () => fireEvent.press(screen.getByTestId("toggle")));
    expect(screen.getByText("Toggle")).toHaveStyle({ color: "#66aaff" });
    expect(screen.getByTestId("toggle-card")).toHaveStyle({ backgroundColor: "#000000" });
  });

  it("resolves breakpoint values against the screen, as the device does", async () => {
    StyleSheet.configure({ breakpoints: { xs: 0, md: 100000 } } as any);
    const responsive = StyleSheet.create({ box: { padding: { xs: 3, md: 9 } } } as any);
    expect(UnistylesRuntime.breakpoint).toBe("xs");
    await render(<View testID="responsive" style={(responsive as any).box} />);
    expect(screen.getByTestId("responsive")).toHaveStyle({ padding: 3 });
  });

  it("serves the reanimated entry from its own mock, by import and by require", () => {
    // The entry is a module of its own in the preset; it must not be answered by the
    // package root's mock with "reanimated" as a leaf.
    expect(typeof useAnimatedTheme).toBe("function");
    const req = createRequire(import.meta.url);
    expect(req("react-native-unistyles/reanimated").useAnimatedTheme).toBe(useAnimatedTheme);
  });
});
