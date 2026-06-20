// Accessibility queries and the style matcher are core RNTL use cases that depend
// on real RN prop handling (accessibilityRole/Label → role, StyleSheet ref →
// resolved style object). matchers.test.tsx covers text/display/disabled matchers;
// these cover the a11y query path and toHaveStyle, which it doesn't.
import { render, screen } from "@testing-library/react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { describe, expect, it } from "vitest";

const styles = StyleSheet.create({
  box: { width: 10, height: 20, opacity: 0.5 },
});

describe("native engine: accessibility queries", () => {
  it("queries a real component by role and by label", () => {
    render(
      <Pressable accessibilityRole="button" accessibilityLabel="Submit form">
        <Text>Go</Text>
      </Pressable>,
    );
    expect(screen.getByRole("button")).toBeTruthy();
    expect(screen.getByLabelText("Submit form")).toBeTruthy();
  });
});

describe("native engine: toHaveStyle resolves StyleSheet refs", () => {
  it("matches the resolved style object from StyleSheet.create", () => {
    render(<View testID="box" style={styles.box} />);
    expect(screen.getByTestId("box")).toHaveStyle({ width: 10, height: 20, opacity: 0.5 });
  });
});
