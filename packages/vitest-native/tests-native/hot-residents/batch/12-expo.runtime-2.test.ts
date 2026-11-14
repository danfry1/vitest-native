import { test } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  const expo = (globalThis as unknown as { expo?: Record<string, unknown> }).expo;
  observe("expo.runtime", { expoPresent: expo != null, added: typeof expo?.vnAudit });
});
