// Which cleanup the automatic cleanup calls. RNTL 13's `cleanup` leaves each async
// unmount running (13.3 build/cleanup.js), and its passive-effect destructors then run a
// few microtasks after the hook returns, before the next test, so no test can tell the
// two apart by the tree's state alone. This pins the choice directly: `cleanupAsync`
// when the entry has one (13), else `cleanup` (12's synchronous one, 14's async one).
import Module from "node:module";
import path from "node:path";
import { afterEach as vitestAfterEach, expect, test, vi } from "vitest";
import { installRntlAutoCleanup } from "../src/rntl-support.mjs";

const AUTO_CLEANUP = Symbol.for("vitest-native.rntl-auto-cleanup");
const entry = path.join(
  "/vn-cleanup-choice",
  "node_modules",
  "@testing-library",
  "react-native",
  "build",
  "index.js",
);
const cache = Module._cache as Record<string, { exports: unknown } | undefined>;

vitestAfterEach(() => {
  delete cache[entry];
  delete (globalThis as Record<symbol, unknown>)[AUTO_CLEANUP];
});

async function runCleanupWith(exports: Record<string, unknown>) {
  cache[entry] = { exports } as never;
  let hook: (() => Promise<void>) | undefined;
  installRntlAutoCleanup((fn: () => Promise<void>) => {
    hook = fn;
  });
  expect(hook).toBeTypeOf("function");
  await hook!();
}

test("calls cleanupAsync when the entry has one (RNTL 13)", async () => {
  const cleanup = vi.fn();
  const cleanupAsync = vi.fn(async () => {});
  await runCleanupWith({ cleanup, cleanupAsync });
  expect(cleanupAsync).toHaveBeenCalledOnce();
  expect(cleanup).not.toHaveBeenCalled();
});

test("calls cleanup when there is no cleanupAsync (RNTL 12, 14)", async () => {
  const cleanup = vi.fn(async () => {});
  await runCleanupWith({ cleanup });
  expect(cleanup).toHaveBeenCalledOnce();
});
