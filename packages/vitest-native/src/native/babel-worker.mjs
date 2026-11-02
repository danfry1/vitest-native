// The native engine's Babel, on a thread of its own (see transform.mjs, "Where Babel
// runs"). Started by transform.mjs on a thread's first compile, and answers one request
// at a time while the calling thread waits. Nothing of the engine is loaded here, so
// Babel, its presets and its plugins load as published, and nothing the test files
// install on their own thread's globals can reach them.
//
// Only node:worker_threads is imported statically. The caller is blocked until it is
// answered, so this thread says when it ends before anything that could fail to load
// (Babel's side, babel-toolchain.mjs, is imported below). A thread V8 stops for running
// out of heap runs no exit handler at all; the caller's deadline covers that.
import { workerData } from "node:worker_threads";

const { port, signal, compileCache } = workerData;

// signal[1] = 1: this thread has ended. signal[0] = 2 wakes a caller waiting on it.
process.on("exit", () => {
  Atomics.store(signal, 1, 1);
  Atomics.store(signal, 0, 2);
  Atomics.notify(signal, 0);
});

// Node's compile cache, on here exactly when it is on in the thread that started this
// one (compile-cache.mjs decides), so Babel's modules load from it as they did there.
if (compileCache) {
  try {
    (await import("node:module")).default.enableCompileCache?.(compileCache);
  } catch {
    // A pure optimization, as in compile-cache.mjs.
  }
}

const { handleToolchainRequest } = await import("./babel-toolchain.mjs");

function answer(message) {
  port.postMessage(message);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

port.on("message", (request) => {
  try {
    answer({ ok: handleToolchainRequest(request) });
  } catch (err) {
    answer({
      error: {
        name: err?.name ?? "Error",
        message: err?.message ?? String(err),
        code: err?.code,
        stack: err?.stack,
      },
    });
  }
});
