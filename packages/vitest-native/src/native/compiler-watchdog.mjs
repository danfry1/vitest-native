// The registry compiler's watchdog thread (registry-compiler.mjs). A compile runs
// synchronously on the compiler's main thread, so that thread cannot notice its parent
// dying, and the parent's timeout dies with the parent. This thread ends the process when
// it has been orphaned (POSIX reparents it, so its ppid changes) or has run longer than
// the parent would ever wait. Time the machine spends asleep does not count
// (suspension.mjs): on wake the compile carries on, as its parent's timer does.
import { workerData } from "node:worker_threads";
import { suspensionTracker } from "./suspension.mjs";

const { deadlineMs, pollMs } = workerData;
const start = process.ppid;
const started = performance.now();
const suspension = suspensionTracker({ intervalMs: pollMs });
setInterval(() => {
  suspension.tick();
  const ran = performance.now() - started - suspension.suspendedMs;
  if (process.ppid !== start || ran > deadlineMs) process.kill(process.pid, "SIGKILL");
}, pollMs);
