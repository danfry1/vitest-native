// A file that relies on RNTL's auto-cleanup, after the polluter on the same worker.
import { expect, test } from "vitest";
import React, { useEffect } from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

let unmounted = false;
function Tracked() {
  useEffect(() => () => {
    unmounted = true;
  }, []);
  return <Text>victim</Text>;
}

test("renders a component", async () => {
  await render(<Tracked />);
});

test("the previous test's component was unmounted by RNTL's auto-cleanup", () => {
  expect(unmounted).toBe(true);
});
