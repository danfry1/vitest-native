// Times out inside act() with fake timers on, Date included, and leaves them installed:
// the act() callback waits on a fake timer that never fires.
import { act } from "@testing-library/react-native";
import { it, vi } from "vitest";

it("hangs inside act under fake timers", { timeout: 100 }, async () => {
  vi.useFakeTimers();
  await act(async () => {
    await new Promise((done) => setTimeout(done, 1_000));
  });
});
