// One of two identical files: a component reading the safe-area frame, inside its provider.
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaFrame } from "react-native-safe-area-context";
import { render, screen } from "@testing-library/react-native";

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
