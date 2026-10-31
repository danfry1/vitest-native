// With isolate: false, Vitest keeps the fake timers the setup file installed for the
// previous file, so the auto-cleanup must wait on a timer they cannot replace.
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
  return <Text>file 01</Text>;
}

test("renders with the setup file's fake timers on", async () => {
  expect(vi.isFakeTimers()).toBe(true);
  await render(<Tracked />);
});

test("the previous test's tree was unmounted", () => {
  expect(unmounted).toBe(1);
  expect(() => screen.getByText("file 01")).toThrow();
});
