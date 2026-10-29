// Without fake timers RNTL takes its real-timer path, as it did before it had a
// `jest` of its own (src/native/rntl-hooks.mjs): findBy* and waitFor wait in real time.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";
import { Delayed } from "./delayed";

test("findBy* waits for a real timer in real time", async () => {
  const start = vi.getRealSystemTime();
  await render(<Delayed ms={150} />);
  expect(await screen.findByText("ready")).toBeTruthy();
  expect(vi.getRealSystemTime() - start).toBeGreaterThanOrEqual(140);
});

test("waitFor times out in real time", async () => {
  await render(<Delayed ms={60_000} />);
  const start = vi.getRealSystemTime();
  await expect(
    waitFor(() => expect(screen.getByText("ready")).toBeTruthy(), { timeout: 300 }),
  ).rejects.toThrow();
  expect(vi.getRealSystemTime() - start).toBeGreaterThanOrEqual(290);
});
