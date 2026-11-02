// This file ends with fake timers still installed; with isolate: false the next file
// starts with them, and its auto-cleanup must still run.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>file 02</Text>;
}

test("renders", async () => {
  await render(<Tracked />);
});

test("the previous test's tree was unmounted", () => {
  expect(unmounted).toBe(1);
  expect(() => screen.getByText("file 02")).toThrow();
});

test("leaves fake timers on", () => {
  vi.useFakeTimers();
});
