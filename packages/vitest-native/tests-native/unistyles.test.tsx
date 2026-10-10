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
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";

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
});
