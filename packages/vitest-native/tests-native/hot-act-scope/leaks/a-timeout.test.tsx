// Times out while awaiting act(), so React's act scope is still open when the file ends.
import { act } from "@testing-library/react-native";
import { it, vi } from "vitest";

it("hangs inside act", { timeout: 100 }, async () => {
  vi.useRealTimers();
  await act(async () => {
    await new Promise((done) => setTimeout(done, 30_000));
  });
});
