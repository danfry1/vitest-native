// One of two identical files: a component reading the safe-area frame, inside its provider.
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaFrame } from "react-native-safe-area-context";
import { render, screen } from "@testing-library/react-native";

// The React this file rendered with, kept on `process` (which the hot reset leaves alone)
// for the next file to compare: under freshRuntime each file has its own, and with React
// resident (the gate's control edits `fresh` to false) every file has the first one.
const seen = ((process as { __vnFreshReacts?: unknown[] }).__vnFreshReacts ??= []);
const fresh = true;

function Frame() {
  const frame = useSafeAreaFrame();
  return <Text>width {String(frame.width)}</Text>;
}

test("renders a component that reads the safe-area frame", async () => {
  await render(
    <SafeAreaProvider>
      <Frame />
    </SafeAreaProvider>,
  );
  expect(screen.getByText(/^width /)).toBeTruthy();
});

test("renders with this file's own React under freshRuntime, the first file's otherwise", () => {
  if (fresh) expect(seen, "an earlier file's React").not.toContain(React);
  else if (seen.length > 0) expect(seen).toContain(React);
  seen.push(React);
});
