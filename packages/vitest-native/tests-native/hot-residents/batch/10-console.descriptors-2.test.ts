import { test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  observe("console.descriptors", {
    replacedInfo: console.info.name === "vnAuditInfo",
    addedMethod: typeof (console as unknown as Record<string, unknown>).vnAudit,
  });
});
