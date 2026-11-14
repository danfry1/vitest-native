import { test } from "vitest";

test("adds a global and replaces another", () => {
  (globalThis as Record<string, unknown>).__vnAuditGlobal = { from: "an earlier file" };
  globalThis.fetch = function vnAuditFetch() {
    return Promise.reject(new Error("audit probe"));
  } as typeof fetch;
});
