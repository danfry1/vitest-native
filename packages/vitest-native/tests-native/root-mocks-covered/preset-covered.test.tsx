import React from "react";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { render, screen } from "@testing-library/react-native";

test("a manual mock of a package a preset stands in for leaves the preset in place", async () => {
  function Insets() {
    return <Text>{useSafeAreaInsets().top}</Text>;
  }
  await render(<Insets />);
  expect(screen.queryByText("-1")).toBeNull();
});
