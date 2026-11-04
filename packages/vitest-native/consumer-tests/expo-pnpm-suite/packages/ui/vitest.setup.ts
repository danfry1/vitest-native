// The library's own test setup, which other workspace packages list in their setupFiles,
// as monorepos share one setup across packages. It runs in each consumer's test worker.
import { expect } from "vitest";

(globalThis as { __suiteUiSetup?: number }).__suiteUiSetup =
  ((globalThis as { __suiteUiSetup?: number }).__suiteUiSetup ?? 0) + 1;

expect.extend({
  toBeSuiteAvatar(received: { props?: { testID?: unknown } } | null) {
    const pass = received?.props?.testID === "avatar";
    return { pass, message: () => `expected the @suite/ui Avatar, got ${String(received)}` };
  },
});
