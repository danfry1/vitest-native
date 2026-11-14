import { test } from "vitest";

test("sets an environment variable and leaves it", () => {
  process.env.VN_AUDIT_ENV = "set by an earlier file";
});
