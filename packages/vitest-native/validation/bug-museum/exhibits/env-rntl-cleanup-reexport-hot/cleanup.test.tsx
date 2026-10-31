// RNTL through a re-exporting package, globals: false, hot runtime.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "museum-test-utils";
import { expect, test } from "vitest";

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted += 1;
    },
    [],
  );
  return <Text>first screen</Text>;
}

test("renders a tree", async () => {
  await render(<Tracked />);
  expect(screen.getByText("first screen")).toBeTruthy();
});

test("the previous test's tree was unmounted", () => {
  expect(unmounted, "the previous test's tree was unmounted").toBe(1);
});
