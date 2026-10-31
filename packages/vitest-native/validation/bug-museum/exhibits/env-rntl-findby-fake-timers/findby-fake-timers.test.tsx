// RNTL advances fake timers only through a global jest.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

function Delayed() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);
  return <Text>{ready ? "ready" : "waiting"}</Text>;
}

test("findBy advances Vitest's fake timers", async () => {
  vi.useFakeTimers();
  await render(<Delayed />);
  expect(await screen.findByText("ready")).toBeTruthy();
});
