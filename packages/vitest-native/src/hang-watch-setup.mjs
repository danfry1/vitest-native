// hangTimeout, the worker side: before each test, record which test is starting and how
// long it may legitimately take, in a per-worker file the main process reads when it
// sees no progress (hang-watch.mjs).
//
// The record is written synchronously, before the test body runs. A worker reports a
// test's start to the main process in batches, asynchronously, so one that then sticks in
// synchronous code never sends it; this file is on disk regardless.
//
// The test's own limits come from the test itself: its `timeout` (an `it(name, fn, ms)`
// or `{ timeout }` option, or `vi.setConfig({ testTimeout })`), and the hook timeout for
// the hooks around it. Each retry runs this hook again, so each attempt gets its own record.
//
// Added to the run's setup files by the plugin only while the watch is on; the records
// directory and the hook timeout come from the plugin through Vitest's provide/inject.
import fs from "node:fs";
import inspector from "node:inspector";
import path from "node:path";
import { threadId } from "node:worker_threads";
import { beforeEach, inject } from "vitest";

const watch = inject("vitestNativeHangWatch");

/** "outer > inner > test", as Vitest's reporters name a test. */
function fullName(task) {
  const names = [];
  for (let at = task; at && at.type !== "file" && at.name !== undefined; at = at.suite) {
    if (at.type === "suite" && at.suite === undefined) break; // the file's root suite
    names.unshift(at.name);
  }
  return names.join(" > ");
}

if (watch?.dir) {
  const file = path.join(watch.dir, `${process.pid}-${threadId}.json`);
  beforeEach((context) => {
    const task = context.task;
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({
          file: task.file?.filepath ?? null,
          test: fullName(task),
          at: Date.now(),
          // The runner resolves it at collection: the test's own, its describe's, or testTimeout.
          timeout: task.timeout ?? 5000,
          hookTimeout: watch.hookTimeout,
          debugger: Boolean(inspector.url()),
        }),
      );
    } catch (error) {
      // The watch then names the file only; the test itself is unaffected.
      process.stderr.write(`[vitest-native] hangTimeout could not record a test start: ${error}\n`);
    }
  });
}
