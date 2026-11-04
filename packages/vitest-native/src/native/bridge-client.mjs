// The require bridge's synchronous client, in a test worker. `fetchSync` asks the main
// process (bridge-server.mjs) for Vite's transform of one module and waits for it, as
// the Babel toolchain call waits for its thread (transform.mjs): the helper thread
// (bridge-thread.mjs) starts on the first request, so a worker that never takes the
// bridge starts nothing.
import fs from "node:fs";
import { MessageChannel, receiveMessageOnPort, Worker } from "node:worker_threads";
import { VitestNativeError } from "../errors.mjs";
import { BRIDGE_PROVIDE_KEY } from "./bridge-server.mjs";

// Captured as this module loads: the call below runs while test code is on the stack,
// and a test that stubs one of these (or fakes the clock) must not stop the bridge.
const atomicsLoad = Atomics.load;
const atomicsStore = Atomics.store;
const atomicsWait = Atomics.wait;
const SharedArrayBufferCtor = SharedArrayBuffer;
const Int32ArrayCtor = Int32Array;
const now = performance.now.bind(performance);

/** How long one fetch may take: Vite transforms the file in the main process. */
const FETCH_DEADLINE_MS = 30_000;

let bridge = null;
let seq = 0;
let options = {};

/** Counters for tests and the count gate: starts, fetches, and time spent waiting. */
export const bridgeStats = (globalThis[Symbol.for("vitest-native.bridge")] ??= {
  threadStarts: 0,
  fetches: 0,
  fetchMs: 0,
});

/** Internal test seam: the helper thread now running, or null. */
export function _bridgeThread() {
  return bridge?.worker ?? null;
}

/** Internal test seam: `{ deadlineMs, endpoint, token }`; stops the current thread. */
export function _setBridgeOptions(next = {}) {
  bridge?.worker.terminate();
  bridge = null;
  options = next;
}

function provided() {
  const value = globalThis.__vitest_worker__?.providedContext?.[BRIDGE_PROVIDE_KEY];
  const endpoint = options.endpoint ?? value?.endpoint;
  const token = options.token ?? value?.token;
  if (typeof endpoint !== "string" || typeof token !== "string") {
    throw new VitestNativeError(
      "BRIDGE_UNAVAILABLE",
      `experimental.ownershipModel 'resolution': this worker has no bridge to the main ` +
        `process (Vitest's provided context has no ${BRIDGE_PROVIDE_KEY}). Report this, ` +
        `with the Vitest config, as a vitest-native bug.`,
    );
  }
  return { endpoint, token };
}

function startBridge() {
  bridgeStats.threadStarts++;
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32ArrayCtor(new SharedArrayBufferCtor(8));
  const worker = new Worker(new URL("./bridge-thread.mjs", import.meta.url), {
    workerData: { port: port2, signal, ...provided() },
    transferList: [port2],
    execArgv: [],
  });
  worker.on("error", (err) => {
    process.stderr.write(`[vitest-native] the require bridge's thread: ${err?.stack ?? err}\n`);
  });
  worker.unref();
  port1.unref();
  return { port: port1, signal, worker };
}

/**
 * Vitest's fetch result for `url` (from `importer`, in `environment`), synchronously:
 * `{ code, file, id, url, invalidate }` for a module Vite evaluates, `{ externalize, type }`
 * for one Node loads. Fails by name when the main process does not answer in time (the
 * thread is then stopped, so a late answer cannot be taken for a later request), when the
 * thread ends, or when the main process refuses or fails the fetch.
 */
export function fetchSync(url, importer, environment) {
  if (bridge === null || atomicsLoad(bridge.signal, 1) === 1) bridge = startBridge();
  const { port, signal, worker } = bridge;
  const deadlineMs = options.deadlineMs ?? FETCH_DEADLINE_MS;
  const started = now();
  const request = { seq: ++seq, url, importer, environment };
  atomicsStore(signal, 0, 0);
  port.postMessage(request);
  const deadline = started + deadlineMs;
  for (;;) {
    const left = deadline - now();
    if (left <= 0) break;
    if (atomicsWait(signal, 0, 0, Math.min(left, 1000)) !== "timed-out") break;
    if (atomicsLoad(signal, 1) === 1) break;
  }
  bridgeStats.fetchMs += now() - started;
  const reply = receiveMessageOnPort(port)?.message;
  if (reply === undefined || reply.seq !== request.seq) {
    const ended = atomicsLoad(signal, 1) === 1;
    bridge = null;
    if (!ended) {
      worker.terminate();
      throw new VitestNativeError(
        "VITE_FETCH_TIMEOUT",
        `experimental.ownershipModel 'resolution': the main process did not return Vite's ` +
          `transform of ${url} within ${Math.round(deadlineMs / 1000)} s, so the require ` +
          `that reached it cannot be answered. The bridge's thread was stopped.`,
      );
    }
    throw new VitestNativeError(
      "VITE_FETCH_FAILED",
      `experimental.ownershipModel 'resolution': the require bridge's thread ended before ` +
        `it returned ${url}. Its own error, if it has one, is printed as "the require ` +
        `bridge's thread:".`,
    );
  }
  bridgeStats.fetches++;
  if (reply.error) {
    throw new VitestNativeError(
      reply.error.code === "BRIDGE_NOT_VITE_OWNED" ? "BRIDGE_NOT_VITE_OWNED" : "VITE_FETCH_FAILED",
      `experimental.ownershipModel 'resolution': ${reply.error.message}`,
    );
  }
  // As Vitest's own worker reads a fetch answered from its module cache: the code is in
  // the file `tmp` names (vitest's module-runner transport, `"cached" in result`).
  if ("cached" in reply.ok) return { code: fs.readFileSync(reply.ok.tmp, "utf-8"), ...reply.ok };
  return reply.ok;
}
