// `@testing-library/react-native/pure` is RNTL's opt-out of auto-cleanup, and the mock
// engine's setup file must not opt the file back in by loading RNTL's entry itself.
import React from "react";
import { Text } from "react-native";
import * as rntl from "@testing-library/react-native/pure";
import { expect, test } from "vitest";

// RNTL 13's `cleanup` calls each unmount without awaiting it; its `cleanupAsync` waits.
// RNTL 12's and 14's `cleanup` finish the unmount themselves (14's is async).
const { cleanupAsync } = rntl as { cleanupAsync?: () => Promise<void> };
const cleanUp = cleanupAsync ?? rntl.cleanup;

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
  await rntl.render(<Tracked />);
});

test("is not cleaned up automatically", async () => {
  expect(unmounted).toBe(0);
  expect(rntl.screen.getByText("pure screen")).toBeTruthy();
  await cleanUp();
  expect(unmounted).toBe(1);
});
