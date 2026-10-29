// RNTL's async helpers advance Vitest's fake timers without jest-compat: RNTL's own
// files get a `jest` backed by `vi` (src/native/rntl-timers.mjs). Without it, findBy*
// and waitFor poll in real time while the fake clock stands still, and time out.
import React from "react";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { afterEach, expect, test, vi } from "vitest";
import { Delayed } from "./delayed";

afterEach(() => {
  vi.useRealTimers();
});

test("no global jest is installed", () => {
  expect(typeof (globalThis as { jest?: unknown }).jest).toBe("undefined");
});

test("findBy* advances the fake clock to a pending timer", async () => {
  vi.useFakeTimers();
  const start = Date.now();
  await render(<Delayed ms={200} />);
  expect(await screen.findByText("ready")).toBeTruthy();
  // The fake clock moved; the 200 ms passed in fake time, not real time.
  expect(Date.now() - start).toBeGreaterThanOrEqual(200);
});

test("waitFor advances the fake clock to a pending timer", async () => {
  vi.useFakeTimers();
  await render(<Delayed ms={500} />);
  await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
});

test("waitFor's timeout is counted in fake time", async () => {
  vi.useFakeTimers();
  await render(<Delayed ms={60_000} />);
  const realStart = vi.getRealSystemTime();
  await expect(
    waitFor(() => expect(screen.getByText("ready")).toBeTruthy(), { timeout: 2000 }),
  ).rejects.toThrow();
  // Two fake seconds took far less than two real ones.
  expect(vi.getRealSystemTime() - realStart).toBeLessThan(1500);
  expect(screen.getByText("waiting")).toBeTruthy();
});

test("userEvent's delays advance the fake clock", async () => {
  vi.useFakeTimers();
  const onPress = vi.fn();
  await render(
    <Pressable onPress={onPress}>
      <Text>press</Text>
    </Pressable>,
  );
  const user = userEvent.setup();
  await user.press(screen.getByText("press"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
