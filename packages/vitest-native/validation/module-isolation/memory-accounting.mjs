import assert from "node:assert/strict";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const MIB = 1024 * 1024;

if (!isMainThread) {
  const retained = new Array(workerData.elements).fill(workerData.marker);
  parentPort.postMessage({ type: "ready", marker: retained[0] });
  parentPort.on("message", (message) => {
    if (message === "sample") {
      parentPort.postMessage({ type: "sample", usage: process.memoryUsage() });
    } else if (message === "stop") {
      parentPort.close();
    }
  });
} else {
  const workers = [1, 2].map(
    (marker) => new Worker(new URL(import.meta.url), { workerData: { elements: 4_000_000, marker } }),
  );

  await Promise.all(
    workers.map(
      (worker) =>
        new Promise((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", resolve);
        }),
    ),
  );

  const samples = await Promise.all(
    workers.map(
      (worker) =>
        new Promise((resolve, reject) => {
          worker.once("error", reject);
          worker.once("message", ({ usage }) => resolve(usage));
          worker.postMessage("sample");
        }),
    ),
  );
  const main = process.memoryUsage();

  for (const sample of samples) {
    assert.ok(sample.heapUsed > main.heapUsed + 20 * MIB, "worker heap must be isolate-local");
    assert.ok(Math.abs(sample.rss - main.rss) < 24 * MIB, "RSS must describe the whole process");
  }
  assert.ok(
    Math.abs(samples[0].rss - samples[1].rss) < 24 * MIB,
    "thread RSS readings must not be summed as if they were per-worker",
  );

  console.log(
    JSON.stringify(
      {
        node: process.version,
        constrainedMemory: process.constrainedMemory?.() ?? 0,
        availableMemory: process.availableMemory?.() ?? null,
        main,
        workers: samples,
        conclusion: "heapUsed is worker-local; rss is process-wide",
      },
      null,
      2,
    ),
  );

  for (const worker of workers) worker.postMessage("stop");
  await Promise.all(workers.map((worker) => new Promise((resolve) => worker.once("exit", resolve))));
}
