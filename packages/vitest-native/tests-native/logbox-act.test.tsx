/**
 * Regression: under the native engine, AppContainer mounts RN's dev
 * LogBoxNotificationContainer, whose LogBoxStateSubscription schedules a deferred
 * setState that lands AFTER the test's act() — producing a cosmetic
 * "update to LogBoxStateSubscription not wrapped in act()" console.error on every
 * interaction. The native boundary stubs that container to null; this guards it.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { View, Text, Pressable } from "react-native";

function Counter() {
  const [n, setN] = React.useState(0);
  return (
    <View>
      <Text>count: {n}</Text>
      <Pressable onPress={() => setN((x) => x + 1)}>
        <Text>inc</Text>
      </Pressable>
    </View>
  );
}

describe("no LogBox act() warning under native engine", () => {
  it("an interaction emits no 'not wrapped in act' console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await render(<Counter />);
      await fireEvent.press(screen.getByText("inc"));
      expect(screen.getByText("count: 1")).toBeTruthy();
      // Let any deferred (setTimeout/setImmediate) LogBox update fire — that's
      // when the out-of-act warning would have landed.
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      const actWarnings = spy.mock.calls.filter((c) => /not wrapped in act/.test(String(c[0] ?? "")));
      spy.mockRestore();
      expect(actWarnings).toEqual([]);
    }
  });
});
