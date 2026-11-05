// Times out while awaiting act(); the act() callback finishes about half a second later.
import { act } from "@testing-library/react-native";
import { it, vi } from "vitest";

it("times out inside act, which finishes soon after", { timeout: 100 }, async () => {
  vi.useRealTimers();
  await act(async () => {
    await new Promise((done) => setTimeout(done, 600));
  });
});
