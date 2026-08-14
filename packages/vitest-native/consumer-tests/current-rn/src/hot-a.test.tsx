import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { afterEach, expect, test, vi } from "vitest";
import { count, record } from "consumer-state-fixture";

// Twin-runtime probes, from a packed install. Each assertion here fails if the hot
// runtime's ESM generation stamp reaches the test stack itself: a stamped
// @vitest/snapshot means `toMatchSnapshot` asks a SnapshotClient no one set up, and
// a stamped vitest means the fake-timer state this file flips is a copy the runner
// never reads. The state-fixture pair (with hot-b) proves the stamp still DOES
// reach an ordinary stateful CommonJS package.

afterEach(() => {
  vi.useRealTimers();
});

test("snapshot state is the runner's own (hot, packed)", () => {
  const tree = render(
    <View testID="hot-a">
      <Text>hot consumer A</Text>
    </View>,
  ).toJSON();
  expect(tree).toMatchSnapshot();
  expect(screen.getByTestId("hot-a")).toHaveTextContent("hot consumer A");
});

test("fake timers drive the runner's clock (hot, packed)", () => {
  vi.useFakeTimers();
  let fired = false;
  setTimeout(() => {
    fired = true;
  }, 1000);
  vi.advanceTimersByTime(1000);
  expect(fired).toBe(true);
});

test("externalized package state starts fresh in file A", () => {
  expect(count()).toBe(0);
  record("a");
  expect(count()).toBe(1);
});
