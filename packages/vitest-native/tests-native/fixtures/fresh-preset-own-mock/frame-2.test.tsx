// One of two identical files: a component reading the safe-area frame through the
// library's own mock, and the React this file rendered with, kept on `process` (which the
// hot reset leaves alone) for the next file to compare.
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaFrame } from "react-native-safe-area-context";
import { render, screen } from "@testing-library/react-native";

const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);

function Frame() {
  const frame = useSafeAreaFrame();
  return <Text>width {String(frame.width)}</Text>;
}

test("renders through the library's own mock with this file's own React", async () => {
  await render(
    <SafeAreaProvider>
      <Frame />
    </SafeAreaProvider>,
  );
  expect(screen.getByText(/^width /)).toBeTruthy();
  expect(seen, "an earlier file's React").not.toContain(React);
  seen.push(React);
});
