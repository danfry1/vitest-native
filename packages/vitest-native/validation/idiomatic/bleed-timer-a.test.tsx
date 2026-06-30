import { test, vi } from "vitest";

// Installs fake timers and deliberately does NOT restore them. If Vitest's
// per-file timer reset doesn't run under hot, bleed-timer-b's real setTimeout
// would never fire (and that test would hang/fail).
test("install fake timers and leave them installed", () => {
  vi.useFakeTimers();
});
