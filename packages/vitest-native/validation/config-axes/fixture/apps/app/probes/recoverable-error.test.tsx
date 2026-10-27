// A render that throws once and then succeeds is a RECOVERABLE error: React retries and
// reports it. react-test-renderer 19 reports it through reportError, else
// process.emit('uncaughtException'), which Vitest counts as an unhandled error and exits
// 1 with every test passing. Jest, devices and RNTL 14's renderer log it.
// Run on its own (see probes.mjs): the verdict is the process exit code.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

let renders = 0;
function FailsOnce() {
  renders += 1;
  if (renders === 1) throw new Error("first render fails");
  return <Text>recovered</Text>;
}

test("a recoverable render error does not fail the run", async () => {
  // A concurrent root is what retries; RNTL 13 and 14 use one by default, 12 on request.
  await render(<FailsOnce />, { concurrentRoot: true } as object);
  expect(screen.getByText("recovered")).toBeTruthy();
});
