import React from "react";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { render, screen } from "@testing-library/react-native";

test("the preset stands in for safe-area-context", async () => {
  function Insets() {
    return <Text>{`top ${useSafeAreaInsets().top}`}</Text>;
  }
  await render(<Insets />);
  expect(screen.queryByText("top -1")).toBeNull();
});
