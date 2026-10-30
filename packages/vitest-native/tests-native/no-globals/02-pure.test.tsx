// `@testing-library/react-native/pure` is RNTL's opt-out of auto-cleanup. Under
// `--mode hot` and `--mode noiso` this file runs after 01 in the same worker, whose
// module cache then holds RNTL's entry: only an import by this file may turn the
// cleanup on.
import React from "react";
import { Text } from "react-native";
import * as rntl from "@testing-library/react-native/pure";
import { render, screen } from "@testing-library/react-native/pure";
import { expect, test } from "vitest";

// RNTL 13's `cleanup` calls each unmount without awaiting it (13.3 build/cleanup.js), so
// whether the effect's destructor has run when it returns depends on the Node version's
// microtask timing; its `cleanupAsync` awaits each one. RNTL 12's `cleanup` and 14's
// (async, no `cleanupAsync`) finish the unmount themselves.
const cleanup = (rntl as { cleanupAsync?: () => Promise<void> }).cleanupAsync ?? rntl.cleanup;

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
  const expected = process.env.VN_NO_GLOBALS_MODE === "native" ? 1 : 2;
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
