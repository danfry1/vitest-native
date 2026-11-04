// Short-lived entrypoint for a cold React Native registry build.
//
// The parent sends one JSON options object over stdin and receives one JSON result
// on stdout. No diagnostic logging is allowed here: stdout is a protocol, while a
// compiler failure is returned structurally for the parent to report once.
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { buildRegistry } from "./registry.mjs";

// A compile runs synchronously on this thread, so this process cannot notice its parent
// dying, and the parent's timeout dies with the parent. A watchdog thread ends the
// process when it has been orphaned (POSIX reparents it, so its ppid changes) or has
// run longer than the parent would ever wait (registry-process.mjs gives it 120 s), so
// a stuck compile cannot outlive the run.
const ORPHAN_POLL_MS = 5_000;
const DEADLINE_MS = 130_000;
new Worker(
  `const start = process.ppid;
   const deadline = Date.now() + ${DEADLINE_MS};
   setInterval(() => {
     if (process.ppid !== start || Date.now() > deadline) process.kill(process.pid, "SIGKILL");
   }, ${ORPHAN_POLL_MS});`,
  { eval: true },
).unref();
import { compileOnThisThread } from "./transform.mjs";

// No test code runs in this process, so Babel runs on its one thread (transform.mjs,
// "Where Babel runs"): the process's heap bound covers Babel, and running out of it is
// the out-of-memory exit bounded-process.mjs retries with more heap.
compileOnThisThread();

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function respond(value) {
  fs.writeSync(3, JSON.stringify(value));
}

try {
  // `testDelayMs`: the parent's internal test hold (registry-process.mjs,
  // _setRegistryBuildOptions), applied before the compiler starts.
  const { testDelayMs, ...options } = JSON.parse(fs.readFileSync(0, "utf8"));
  if (testDelayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, testDelayMs);
  const started = performance.now();
  const registryFile = buildRegistry({
    ...options,
    diagnostics: false,
    failOnError: true,
  });
  let count = null;
  if (registryFile) {
    try {
      count = JSON.parse(fs.readFileSync(`${registryFile}.json`, "utf8")).count ?? null;
    } catch {}
  }
  respond({
    ok: registryFile !== null,
    registryFile,
    count,
    durationMs: Math.round(performance.now() - started),
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
  });
  if (registryFile === null) process.exitCode = 2;
} catch (error) {
  respond({ ok: false, error: messageOf(error) });
  process.exitCode = 1;
}
