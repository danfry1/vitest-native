// One of two identical files: the unistyles preset's useUnistyles(), which subscribes to
// theme changes with useSyncExternalStore from the rendering React.
import React from "react";
import { Pressable, Text } from "react-native";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

// The React this file rendered with, kept on `process` (which the hot reset leaves alone)
// for the next file to compare: under freshRuntime each file has its own, and with React
// resident (the gate's control edits `fresh` to false) every file has the first one.
const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);
const fresh = true;

const themes = {
  light: { colors: { accent: "#0055ff" } },
  dark: { colors: { accent: "#66aaff" } },
};
StyleSheet.configure({ themes, settings: { initialTheme: "light" } } as never);

function Toggle() {
  const { theme } = useUnistyles() as { theme: typeof themes.light };
  return (
    <Pressable testID="toggle" onPress={() => UnistylesRuntime.setTheme("dark" as never)}>
      <Text style={{ color: theme.colors.accent }}>themed</Text>
    </Pressable>
  );
}

test("useUnistyles() re-renders its component when the theme changes", async () => {
  UnistylesRuntime.setTheme("light" as never);
  await render(<Toggle />);
  expect(screen.getByText("themed")).toHaveStyle({ color: "#0055ff" });
  await act(async () => fireEvent.press(screen.getByTestId("toggle")));
  expect(screen.getByText("themed"), "the theme after the switch").toHaveStyle({
    color: "#66aaff",
  });
});

test("renders with this file's own React under freshRuntime, the first file's otherwise", () => {
  if (fresh) expect(seen, "an earlier file's React").not.toContain(React);
  else if (seen.length > 0) expect(seen).toContain(React);
  seen.push(React);
});
