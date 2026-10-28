import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";

function Delayed() {
  const [state, setState] = useState("waiting");
  useEffect(() => {
    const t = setTimeout(() => setState("done"), 10);
    return () => clearTimeout(t);
  }, []);
  return <Text>{state}</Text>;
}

// Real timers throughout. The update comes from a timer, outside act, so React
// hands it to the scheduler, which posts it with the timer functions it captured
// when it was first loaded.
test("file 2: an update from a real timer renders", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {}); // "not wrapped in act(...)"
  await render(<Delayed />);
  let text = "waiting";
  try {
    await waitFor(() => expect(screen.getByText("done")).toBeTruthy(), { timeout: 1000 });
    text = "done";
  } finally {
    console.log(`[leak:timers] b.test.tsx text after waitFor(1s) = ${text}`);
  }
});
