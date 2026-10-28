import { expect, test, vi } from "vitest";

// Vitest restores every vi.spyOn after each file, in its run loop and outside any
// file's own error handling. Restoring a spy on an object frozen after the spy was
// installed throws there, which rejects the task with the file's tests all passed.
const target = { method: () => "real" };

test("leaves a spy that cannot be restored", () => {
  vi.spyOn(target, "method").mockReturnValue("spied");
  Object.freeze(target);
  expect(target.method()).toBe("spied");
});
