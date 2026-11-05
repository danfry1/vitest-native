// The native engine's Babel, on a thread of its own (see transform.mjs, "Where Babel
// runs"). Started by transform.mjs on a thread's first compile, and answers one request
// at a time while the calling thread waits. Nothing of the engine is loaded here, so
// Babel, its presets and its plugins load as published, and nothing the test files
// install on their own thread's globals can reach them.
//
// The thread starts from transform.mjs's TOOLCHAIN_BOOTSTRAP, which says when the thread
// ends, and reports this file failing to load, before this file runs. A thread V8 stops
// for running out of heap runs no exit handler at all; the caller's deadline covers that.
import { workerData } from "node:worker_threads";

const { port, signal, compileCache } = workerData;

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

// Each answer carries its request's id, posted first and then stored to the signal:
// the caller reads only the answer whose id it is waiting for (transform.mjs).
function answer(id, message) {
  port.postMessage({ id, ...message });
  Atomics.store(signal, 0, id);
  Atomics.notify(signal, 0);
}

port.on("message", ({ id, request }) => {
  try {
    answer(id, { ok: handleToolchainRequest(request) });
  } catch (err) {
    answer(id, {
      error: {
        name: err?.name ?? "Error",
        message: err?.message ?? String(err),
        code: err?.code,
        stack: err?.stack,
      },
    });
  }
});
