import { it, expect } from "vitest";
import { bump, count } from "./shared-state.js";

// A module in the project's own graph — the graph Vitest resets per file when
// isolation is on. The hot pool schedules with isolation off, so the engine performs
// that reset itself; if that ever became a no-op, this is where it would show.
it("sees a fresh module graph and then dirties it", () => {
  expect(count()).toBe(0);
  bump();
  expect(count()).toBe(1);
});
