import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { useDerivedValue, useTimestamp } from "react-native-reanimated";

// Reanimated 4's hooks give shared values read with .get(), as an app reads them.
function Clock() {
  const timestamp = useTimestamp();
  const seconds = useDerivedValue(() => Math.floor(timestamp.get() / 1000));
  return <Text>{`${seconds.get()}s`}</Text>;
}

test("the timestamp is a shared value", async () => {
  await render(<Clock />);
  expect(screen.getByText("0s")).toBeTruthy();
});
