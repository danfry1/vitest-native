import { test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  observe("global.descriptors", {
    addedGlobal: typeof (globalThis as Record<string, unknown>).__vnAuditGlobal,
    replacedFetch: globalThis.fetch?.name === "vnAuditFetch",
  });
});
