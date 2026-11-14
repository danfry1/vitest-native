import { test } from "vitest";

type ErrorUtils = { setGlobalHandler(handler: (error: unknown) => void): void };

test("installs a global error handler and leaves it", () => {
  (globalThis as unknown as { ErrorUtils: ErrorUtils }).ErrorUtils.setGlobalHandler(
    function vnAuditHandler() {},
  );
});
