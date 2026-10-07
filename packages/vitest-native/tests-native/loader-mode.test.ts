import { registerHooks } from "node:module";
import { expect, it } from "vitest";

// The ESM loader hooks run in-thread wherever Node offers module.registerHooks
// (22.15+, 23.5+): the threaded module.register() makes every externalized resolve and
// load a blocking cross-thread request, which profiled at 18% of worker CPU on a
// production suite. A silent fallback would pass every behavioural test and only cost
// speed, so the mode itself is asserted. VITEST_NATIVE_LOADER_THREAD=1 forces threads.
it("installs the loader hooks in-thread when Node supports it", () => {
  const expected =
    typeof registerHooks === "function" && process.env.VITEST_NATIVE_LOADER_THREAD !== "1"
      ? "in-thread"
      : "thread";
  expect((globalThis as { __vitest_native_loader_mode?: string }).__vitest_native_loader_mode).toBe(
    expected,
  );
});
