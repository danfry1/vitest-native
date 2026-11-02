import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

function Delayed() {
  const [state, setState] = useState("waiting");
  useEffect(() => {
    const t = setTimeout(() => setState("done"), 10);
    return () => clearTimeout(t);
  }, []);
  return <Text>{state}</Text>;
}

// Real timers throughout. The update comes from a timer, outside act, so React hands it
// to the scheduler, which posts it with the timer functions it captured when it was first
// loaded. The test waits a fixed real 300 ms and then reads what rendered, so a scheduler
// still holding the previous file's fake timers shows as "waiting", not as a timeout.
test("file 2: an update from a real timer renders", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // "not wrapped in act(...)"
  const realSetTimeout = globalThis.setTimeout;
  await render(<Delayed />);
  await new Promise((resolve) => realSetTimeout(resolve, 300));
  const shown = screen.queryByText("done") ? "done" : "waiting";
  expect(shown, "the timer-driven update rendered within 300 ms").toBe("done");
});
