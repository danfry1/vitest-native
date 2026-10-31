// RNTL unmounts each test's tree in an afterEach it registers only when `afterEach` is a
// global, so with Vitest's default `globals: false` a later test saw the earlier screen.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
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
  expect(unmounted).toBe(1);
});
