// Short-lived entrypoint for a cold React Native registry build.
//
// One JSON options object in (a file named by the first argument), one JSON result out. No logging: the output is a
// protocol, and a failure is returned for the parent to report once.
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { readInput } from "./bounded-process.mjs";
import { buildLibraryRegistry, buildRegistry } from "./registry.mjs";

// A watchdog thread ends this process if its parent dies or it runs longer than the
// parent would ever wait (registry-process.mjs gives it 120 s), not counting time the
// machine spends asleep (compiler-watchdog.mjs).
new Worker(new URL("./compiler-watchdog.mjs", import.meta.url), {
  workerData: { deadlineMs: 130_000, pollMs: 5_000 },
}).unref();
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
  const { testDelayMs, ...options } = readInput();
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
  // The library registry is layered on React Native's and built in the same child,
  // after it. Its failure is reported apart, so it never costs React Native's.
  let libraryRegistryFile = null;
  let libraryError;
  if (registryFile && (options.libraryEntries?.length ?? 0) > 0) {
    try {
      libraryRegistryFile = buildLibraryRegistry({
        ...options,
        diagnostics: false,
        failOnError: true,
      });
    } catch (error) {
      libraryError = messageOf(error);
    }
  }
  respond({
    ok: registryFile !== null,
    registryFile,
    libraryRegistryFile,
    libraryError,
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
