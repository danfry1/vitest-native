import { expect, test } from "vitest";

test("adds a matcher and leaves it", () => {
  expect.extend({
    toBeVnAudit: () => ({ pass: true, message: () => "" }),
  });
});
