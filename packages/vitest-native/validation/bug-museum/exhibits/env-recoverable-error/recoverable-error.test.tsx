// A render that throws once and then succeeds is a RECOVERABLE error: React retries and
// reports it. Jest, devices and RNTL 14's renderer log it; the run must not fail.
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
  await render(<FailsOnce />, { concurrentRoot: true } as object);
  expect(screen.getByText("recovered")).toBeTruthy();
});
