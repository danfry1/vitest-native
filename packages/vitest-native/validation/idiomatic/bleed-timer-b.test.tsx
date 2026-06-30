import { expect, test } from "vitest";

// Real timers must be in effect here. If the previous file's fake timers bled
// across the per-file reset, this real setTimeout never fires and the test fails
// (times out waiting on the real delay).
test("real timers are restored (previous file's fake timers did not bleed)", async () => {
  let fired = false;
  setTimeout(() => {
    fired = true;
  }, 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(fired).toBe(true);
});
