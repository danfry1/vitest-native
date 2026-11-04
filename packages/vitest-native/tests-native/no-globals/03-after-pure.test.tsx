// A file that imports RNTL's entry after the `/pure` file (02) in the same worker:
// tracking which files import the entry must still turn the cleanup on here.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>later screen</Text>;
}

test("renders", async () => {
  await render(<Tracked />);
});

test("is cleaned up after its test", () => {
  expect(unmounted).toBe(1);
  expect(() => screen.getByText("later screen")).toThrow();
});
