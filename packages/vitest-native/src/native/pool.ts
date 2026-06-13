// Custom Vitest pool for the native engine's hot runtime.
//
// Wraps Vitest's stock ThreadsPoolWorker, changing exactly one thing: the
// worker entrypoint (worker.mjs, which flips config.isolate back on inside the
// worker — see worker.mjs for the full picture). Scheduling-wise this pool runs
// under isolate:false, the only mode where Vitest keeps workers alive across
// files (and the only mode where `canReuse` is consulted), so `canReuse` doubles
// as the worker-recycling policy hook for leak self-defense.
//
// Recycling contract (verified in vitest 4.0.18 Pool source): after every task,
// the scheduler checks `isEqualRunner(runner, nextTask)` — which defers to our
// `canReuse` — and a declined runner is stopped immediately (termination is
// started right away, awaited at the end of the run). So returning false here
// retires the worker; it does NOT leak an idle thread.
//
// Memory-based recycling rides Vitest's own reporting rails: `reportMemory`
// makes the worker include `memoryUsage().heapUsed` in every testfileFinished
// response. (Vitest's config-level `memoryLimit` is hardcoded to the vm pools —
// custom pools can't receive task.memoryLimit — so the threshold is our own
// option. Upstream RFC item.)
import path from "node:path";
import { ThreadsPoolWorker } from "vitest/node";
import type { PoolOptions, PoolRunnerInitializer, PoolTask, WorkerRequest } from "vitest/node";

export interface NativePoolOptions {
  /** Absolute path to the hot worker entry (dist/native/worker.mjs). */
  workerEntry: string;
  /**
   * Recycle (retire) a worker after it has run this many test files.
   * Self-defense against suites that leak process-wide resources the surgical
   * reset can't reclaim. 0 = never recycle by count (default).
   */
  recycleAfterFiles?: number;
  /**
   * Recycle a worker when its reported JS heap usage (bytes) after a test file
   * meets or exceeds this limit. 0 = never recycle by memory (default).
   */
  memoryLimit?: number;
  /** Log when Vitest batches prevent a recycling threshold from being exact. */
  diagnostics?: boolean;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      kb.includes(k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

class NativePoolWorker extends ThreadsPoolWorker {
  override readonly name = "vitest-native";
  // Ask the worker to report heapUsed with every testfileFinished response
  // (only acted on when a memoryLimit is configured).
  readonly reportMemory: boolean;
  // ThreadsPoolWorker resolves its entrypoint from Vitest's own distPath;
  // re-point it at our entry (the same redeclare-in-subclass pattern
  // VmThreadsPoolWorker uses upstream).
  protected override readonly entrypoint: string;
  private environment: PoolOptions["environment"];
  private recycleAfterFiles: number;
  private memoryLimit: number;
  private diagnostics: boolean;
  private filesRun = 0;
  private lastHeapUsed = 0;
  private memoryListenerAttached = false;
  private batchWarningShown = false;

  constructor(options: PoolOptions, native: NativePoolOptions) {
    super(options);
    this.entrypoint = path.resolve(native.workerEntry);
    this.environment = options.environment;
    this.recycleAfterFiles = native.recycleAfterFiles ?? 0;
    this.memoryLimit = native.memoryLimit ?? 0;
    this.diagnostics = native.diagnostics ?? false;
    this.reportMemory = this.memoryLimit > 0;
  }

  override async start(): Promise<void> {
    await super.start();
    // The underlying thread exists only after start(); start() is idempotent
    // and may be called again on reuse, so attach exactly once.
    if (this.reportMemory && !this.memoryListenerAttached) {
      this.memoryListenerAttached = true;
      this.on("message", (message: any) => {
        if (message?.__vitest_worker_response__ && typeof message.usedMemory === "number") {
          this.lastHeapUsed = message.usedMemory;
        }
      });
    }
  }

  override send(message: WorkerRequest): void {
    // A single run message can carry a batch of files. Vitest only calls
    // canReuse between scheduler tasks, so a multi-file task cannot be retired
    // in the middle even if it crosses a configured threshold.
    if (message.type === "run" || message.type === "collect") {
      if (
        this.diagnostics &&
        !this.batchWarningShown &&
        message.context.files.length > 1 &&
        (this.recycleAfterFiles > 0 || this.memoryLimit > 0)
      ) {
        this.batchWarningShown = true;
        console.warn(
          `[vitest-native] hot worker received a ${message.context.files.length}-file Vitest task; ` +
            `recycling thresholds apply after the task completes. Use more than one worker ` +
            `when strict per-file retirement is required.`,
        );
      }
      this.filesRun += message.context.files.length;
    }
    super.send(message);
  }

  // Consulted only for shared (isolate:false) runners; returning false retires
  // this worker (the scheduler stops it and creates a fresh one).
  canReuse(task: PoolTask): boolean {
    if (this.recycleAfterFiles > 0 && this.filesRun >= this.recycleAfterFiles) return false;
    if (this.memoryLimit > 0 && this.lastHeapUsed >= this.memoryLimit) return false;
    // Preserve the stock environment-equality check this hook replaces.
    const env = task.context.environment;
    return env.name === this.environment.name && deepEqual(env.options, this.environment.options);
  }
}

/** Pool initializer for `test.pool` — keeps RN-hot workers alive across files. */
export function nativePool(options: NativePoolOptions): PoolRunnerInitializer {
  return {
    name: "vitest-native",
    createPoolWorker: (poolOptions: PoolOptions) => new NativePoolWorker(poolOptions, options),
  };
}
