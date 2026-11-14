import { test, vi } from "vitest";

// Left in place on purpose: the next file shows whether they reach it.
vi.useFakeTimers();
vi.stubGlobal("__vnAuditStubbed", 1);
vi.stubEnv("VN_AUDIT_STUBBED_ENV", "1");

test("leaves fake timers, a stubbed global and a stubbed env var", () => {});
