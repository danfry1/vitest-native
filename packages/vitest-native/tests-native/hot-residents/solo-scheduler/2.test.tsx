import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { test, vi } from "vitest";
import { observe } from "../audit";

function Delayed() {
  const [state, setState] = useState("waiting");
  useEffect(() => {
    const timer = setTimeout(() => setState("done"), 10);
    return () => clearTimeout(timer);
  }, []);
  return <Text>{state}</Text>;
}

test("observes", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // "not wrapped in act(...)"
  await render(<Delayed />);
  await new Promise((resolve) => setTimeout(resolve, 300));
  observe("react.scheduler-timers", { realTimerUpdateRendered: screen.queryByText("done") !== null });
});
