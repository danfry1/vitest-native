// `@testing-library/react-native/pure` is RNTL's opt-out of auto-cleanup, and the mock
// engine's setup file must not opt the file back in by loading RNTL's entry itself.
import React from "react";
import { Text } from "react-native";
import { cleanup, render, screen } from "@testing-library/react-native/pure";
import { expect, test } from "vitest";

let unmounted = 0;
function Tracked() {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>pure screen</Text>;
}

test("renders", async () => {
  await render(<Tracked />);
});

test("is not cleaned up automatically", async () => {
  expect(unmounted).toBe(0);
  expect(screen.getByText("pure screen")).toBeTruthy();
  await cleanup();
  expect(unmounted).toBe(1);
});
