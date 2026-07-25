/**
 * Proves the forks suite actually runs on forks.
 *
 * Without this, `vitest.forks.config.mts` could quietly degrade into a second copy of
 * the threads suite — every assertion in it would still pass while testing nothing new.
 *
 * Measured, so the assertion is not guesswork: a forks-pool test is the main thread of
 * a CHILD PROCESS and has an IPC channel (isMainThread=true, threadId=0,
 * process.send defined); a threads-pool test is a worker thread (isMainThread=false,
 * threadId=1, no process.send).
 *
 * NOTE on what this does NOT cover. A plugin returning `pool` from config() does not
 * override a pool the user set explicitly — checked by forcing the plugin to return
 * "threads" while this config asks for "forks", which still ran forked. So this guards
 * the config and the pool implementation, not the plugin's merge behaviour.
 *
 * Only the forks config sets VN_EXPECT_POOL, so this is inert elsewhere.
 */
import { isMainThread } from "node:worker_threads";
import { expect, it } from "vitest";

it("runs in a forked child process when the config asked for the forks pool", () => {
  if (process.env.VN_EXPECT_POOL !== "forks") {
    expect(isMainThread).toBe(false); // the threads suite: a worker thread
    return;
  }
  expect(isMainThread).toBe(true);
  expect(typeof process.send).toBe("function");
});
