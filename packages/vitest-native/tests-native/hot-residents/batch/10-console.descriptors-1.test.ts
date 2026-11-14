import { test } from "vitest";

test("replaces a console method and adds one", () => {
  console.info = function vnAuditInfo() {};
  (console as unknown as Record<string, unknown>).vnAudit = () => {};
});
