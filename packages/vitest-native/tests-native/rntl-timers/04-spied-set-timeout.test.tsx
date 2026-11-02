// A spied `setTimeout` with real timers. RNTL reads a mock-function `setTimeout` as
// Jest's legacy fake timers, as it does under Jest, so it asks to advance them; with
// real timers that does nothing, as Jest only warns (src/native/rntl-hooks.mjs).
import React from "react";
import { Pressable, Text } from "react-native";
import { render, screen, userEvent } from "@testing-library/react-native";
import { afterEach, expect, test, vi } from "vitest";
import { Delayed } from "./delayed";

afterEach(() => {
  vi.restoreAllMocks();
});

test("userEvent presses with a spied setTimeout", async () => {
  vi.spyOn(globalThis, "setTimeout");
  const onPress = vi.fn();
  await render(
    <Pressable onPress={onPress}>
      <Text>press</Text>
    </Pressable>,
  );
  await userEvent.setup().press(screen.getByText("press"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("findBy* counts its timeout in fake time with a spied setTimeout, as under Jest", async () => {
  vi.spyOn(globalThis, "setTimeout");
  await render(<Delayed ms={100} />);
  const start = vi.getRealSystemTime();
  // Settles, and well before the default 1000 ms timeout passes in real time.
  await expect(screen.findByText("ready")).rejects.toThrow("Unable to find");
  expect(vi.getRealSystemTime() - start).toBeLessThan(900);
});
