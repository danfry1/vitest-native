// A later file in the same worker: under the hot runtime RNTL stays loaded from an
// earlier file, and its `jest` still drives this file's fake timers.
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { afterEach, expect, test, vi } from "vitest";
import { Delayed } from "./delayed";

afterEach(() => {
  vi.useRealTimers();
});

test("findBy* advances the fake clock in a later file", async () => {
  vi.useFakeTimers();
  await render(<Delayed ms={300} />);
  expect(await screen.findByText("ready")).toBeTruthy();
});
