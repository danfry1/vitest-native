// RNTL loaded while a setup file's fake timers are on (see setup-fake-timers.ts). RNTL
// switches to real timers and back as it loads, to capture the real setImmediate its
// cleanup and waitFor wait on; without that it captured the fake one, and its
// auto-cleanup after each test never finished.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";
import { Delayed } from "../rntl-timers/delayed";

test("fake timers are still on after RNTL loads", () => {
  expect(vi.isFakeTimers()).toBe(true);
});

test("findBy* advances the setup file's fake timers", async () => {
  await render(<Delayed ms={300} />);
  expect(await screen.findByText("ready")).toBeTruthy();
});

test("waitFor advances the setup file's fake timers", async () => {
  await render(<Delayed ms={500} />);
  await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
});
