// The plain Node project (no vitest-native).
import { expect, test } from "vitest";

test("runs under the plain project", () => {
  expect(1 + 1).toBe(2);
});
