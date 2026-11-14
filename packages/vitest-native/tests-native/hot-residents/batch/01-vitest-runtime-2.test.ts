import { test, vi } from "vitest";
import { observe } from "../audit";

test("observes", () => {
  observe("vitest-runtime", {
    fakeTimers: vi.isFakeTimers(),
    stubbedGlobal: typeof (globalThis as Record<string, unknown>).__vnAuditStubbed,
    stubbedEnv: process.env.VN_AUDIT_STUBBED_ENV ?? null,
  });
});
