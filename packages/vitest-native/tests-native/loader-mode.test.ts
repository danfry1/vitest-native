import { registerHooks } from "node:module";
import { expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { inThreadHooksReliable } from "../dist/native/loader.mjs";

// The ESM loader hooks run in-thread where Node's module.registerHooks is reliable
// (inThreadHooksReliable in native/loader.mjs): the threaded module.register() makes
// every externalized resolve and load a blocking cross-thread request, which profiled at
// 18% of worker CPU on a production suite. A silent fallback would pass every
// behavioural test and only cost speed, so the mode itself is asserted.
// VITEST_NATIVE_LOADER_THREAD=1 forces threads.
it("installs the loader hooks in-thread where Node's are reliable", () => {
  const expected =
    typeof registerHooks === "function" &&
    process.env.VITEST_NATIVE_LOADER_THREAD !== "1" &&
    inThreadHooksReliable(process.versions.node)
      ? "in-thread"
      : "thread";
  expect((globalThis as { __vitest_native_loader_mode?: string }).__vitest_native_loader_mode).toBe(
    expected,
  );
});
