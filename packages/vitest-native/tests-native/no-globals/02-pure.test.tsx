// `@testing-library/react-native/pure` is RNTL's opt-out of auto-cleanup. Under
// `--mode hot` this file runs after 01 in the same worker, whose module cache then
// holds RNTL's entry: only an import by this file may turn the cleanup on.
import React from "react";
import { Text } from "react-native";
import { cleanup, render, screen } from "@testing-library/react-native/pure";
import { expect, test } from "vitest";

const FILES_SEEN = Symbol.for("vitest-native.no-globals.files-seen");
const proc = process as unknown as Record<symbol, number>;
proc[FILES_SEEN] = (proc[FILES_SEEN] ?? 0) + 1;

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

test("ran in the worker the mode asks for", () => {
  // Without this the hot run could pass vacuously, one fresh worker per file.
  const expected = process.env.VN_NO_GLOBALS_MODE === "hot" ? 2 : 1;
  expect(proc[FILES_SEEN]).toBe(expected);
});

test("renders", async () => {
  await render(<Tracked />);
});

test("is not cleaned up automatically", async () => {
  expect(unmounted).toBe(0);
  expect(screen.getByText("pure screen")).toBeTruthy();
  await cleanup();
  expect(unmounted).toBe(1);
});
