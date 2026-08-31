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
import { createRequire } from "node:module";
import { ThreadsPoolWorker } from "vitest/node";
import type { PoolOptions, PoolRunnerInitializer, PoolTask, WorkerRequest } from "vitest/node";
import { VitestNativeError } from "../errors.mjs";
import type { HotMemoryPlan } from "./memory.mjs";

export interface NativePoolOptions {
  /** Absolute path to the hot worker entry (dist/native/worker.mjs). */
  workerEntry: string;
  /** The consumer project's root — used to find the Vitest actually driving the run. */
  projectRoot: string;
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
  /** Process-wide RSS envelope shared by every worker in this pool. */
  memoryPlan?: HotMemoryPlan;
  /** Explicit escape hatch for Vitest's unrecyclable one-worker batching mode. */
  allowUnboundedMemory?: boolean;
  /** Log when Vitest batches prevent a recycling threshold from being exact. */
  diagnostics?: boolean;
  /** Test seam; production samples the current process-wide RSS. */
  sampleRss?: () => number;
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

class NativeMemoryCoordinator {
  private recyclingWorker: NativePoolWorker | null = null;

  tryRecycle(worker: NativePoolWorker): boolean {
    if (this.recyclingWorker !== null) return this.recyclingWorker === worker;
    this.recyclingWorker = worker;
    return true;
  }

  finished(worker: NativePoolWorker): void {
    if (this.recyclingWorker === worker) this.recyclingWorker = null;
  }
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
  private memoryPlan: HotMemoryPlan | undefined;
  private memoryCoordinator: NativeMemoryCoordinator;
  private allowUnboundedMemory: boolean;
  private sampleRss: () => number;
  private diagnostics: boolean;
  private filesRun = 0;
  private lastHeapUsed = 0;
  private memoryListenerAttached = false;
  private batchWarningShown = false;

  constructor(
    options: PoolOptions,
    native: NativePoolOptions,
    memoryCoordinator: NativeMemoryCoordinator,
  ) {
    super(options);
    this.entrypoint = path.resolve(native.workerEntry);
    this.environment = options.environment;
    this.recycleAfterFiles = native.recycleAfterFiles ?? 0;
    this.memoryLimit = native.memoryLimit ?? 0;
    this.memoryPlan = native.memoryPlan;
    this.memoryCoordinator = memoryCoordinator;
    this.allowUnboundedMemory = native.allowUnboundedMemory ?? false;
    this.sampleRss = native.sampleRss ?? (() => process.memoryUsage.rss());
    this.diagnostics = native.diagnostics ?? false;
    this.reportMemory = this.memoryLimit > 0;
  }

  override async start(): Promise<void> {
    this.assertInsideHardRssLimit("starting another worker");
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

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      this.memoryCoordinator.finished(this);
    }
  }

  private assertInsideHardRssLimit(action: string): void {
    const hard = this.allowUnboundedMemory ? null : this.memoryPlan?.hardRssLimit;
    if (hard == null) return;
    const rss = this.sampleRss();
    if (rss < hard) return;
    throw new VitestNativeError(
      "HOT_MEMORY_BUDGET_EXCEEDED",
      `hotRuntime stopped before ${action}: process RSS is ${Math.round(rss / 1024 / 1024)} MiB, ` +
        `at or above the ${Math.round(hard / 1024 / 1024)} MiB hard limit derived from ` +
        `${this.memoryPlan?.source ?? "the effective memory ceiling"}. Continuing could let the ` +
        `OS or container kill the test process without a useful result. Reduce maxWorkers, run ` +
        `without hotRuntime, or set hotRuntime.allowUnboundedMemory:true only when an external ` +
        `scheduler provides the memory boundary.`,
    );
  }

  override send(message: WorkerRequest): void {
    // A single run message can carry a batch of files. Vitest only consults
    // canReuse BETWEEN scheduler tasks, so a multi-file task cannot be retired
    // mid-batch even if it crosses a configured threshold. Vitest batches every
    // file into ONE task precisely when isolate:false + maxWorkers===1 (its
    // groupSpecs), which is the hot runtime's single-worker mode — so there a
    // recycle limit can never fire. This is NOT a diagnostics-only detail: a user
    // who set memoryLimit/recycleAfterFiles expecting a memory bound has none,
    // silently. Warn unconditionally (once) so the false sense of safety is
    // visible, with the concrete fix (run >1 worker → per-file tasks → recycling).
    if (message.type === "run" || message.type === "collect") {
      this.assertInsideHardRssLimit("starting the next test task");
      if (
        !this.batchWarningShown &&
        message.context.files.length > 1 &&
        (this.recycleAfterFiles > 0 || this.memoryLimit > 0)
      ) {
        this.batchWarningShown = true;
        const explanation =
          `Vitest batched ${message.context.files.length} files into one task in single-worker ` +
          `mode, so hotRuntime cannot recycle at file boundaries and its memory limits are inert.`;
        if (!this.allowUnboundedMemory) {
          throw new VitestNativeError(
            "HOT_MEMORY_UNBOUNDED",
            `${explanation} Use maxWorkers >= 2, disable hotRuntime, or explicitly accept this ` +
              `risk with hotRuntime:{ allowUnboundedMemory:true }.`,
          );
        }
        console.warn(
          `[vitest-native] ${explanation} Continuing because allowUnboundedMemory:true was set.`,
        );
      }
      this.filesRun += message.context.files.length;
    }
    super.send(message);
  }

  // Consulted only for shared (isolate:false) runners; returning false retires
  // this worker (the scheduler stops it and creates a fresh one).
  canReuse(task: PoolTask): boolean {
    let recycleReason: string | null = null;
    if (this.recycleAfterFiles > 0 && this.filesRun >= this.recycleAfterFiles) {
      recycleReason = `${this.filesRun} files`;
    } else if (this.memoryLimit > 0 && this.lastHeapUsed >= this.memoryLimit) {
      recycleReason = `${Math.round(this.lastHeapUsed / 1024 / 1024)} MiB worker heap`;
    } else {
      const soft = this.allowUnboundedMemory ? null : this.memoryPlan?.softRssLimit;
      const rss = soft == null ? 0 : this.sampleRss();
      if (soft != null && rss >= soft) {
        recycleReason = `${Math.round(rss / 1024 / 1024)} MiB process RSS`;
      }
    }
    if (recycleReason !== null && this.memoryCoordinator.tryRecycle(this)) {
      if (this.diagnostics) {
        console.log(`[vitest-native] recycling hot worker after ${recycleReason}`);
      }
      return false;
    }
    // Preserve the stock environment-equality check this hook replaces.
    const env = task.context.environment;
    return env.name === this.environment.name && deepEqual(env.options, this.environment.options);
  }
}

/**
 * Fail fast when the hot worker would load a different Vitest VERSION from the
 * project's.
 *
 * The worker entry ships inside this package, so its `import 'vitest/worker'`
 * resolves from THIS package's location rather than the project's. Where a monorepo
 * has more than one Vitest install — a linked package, a hoisted `node_modules`,
 * mixed versions across workspaces — the two can differ, and a version difference is
 * invisible at runtime: the start handshake succeeds, the run request is accepted,
 * and no result is ever reported. Vitest then prints "No test files found" with no
 * error at all, and on some paths still exits 0 — a green run that tested nothing.
 *
 * Only a VERSION difference is an error. Two installs of the same version are two
 * module registries but identical code, and they talk to each other perfectly well;
 * failing on the paths alone would block working monorepos where the same version is
 * simply installed twice.
 */
function assertWorkerVitestMatchesProject(workerEntry: string, projectRoot: string): void {
  const resolveVitest = (from: string): { path: string; version: string } | null => {
    try {
      const require_ = createRequire(from);
      const pkgPath = require_.resolve("vitest/package.json");
      return { path: pkgPath, version: (require_(pkgPath) as { version: string }).version };
    } catch {
      return null;
    }
  };
  const worker = resolveVitest(workerEntry);
  const project = resolveVitest(path.join(projectRoot, "package.json"));
  // Either side unresolvable: say nothing. The worker's own import fails with a
  // clearer message than anything invented here, and a project without a resolvable
  // Vitest is not running this code at all.
  if (worker === null || project === null || worker.version === project.version) return;
  throw new VitestNativeError(
    "HOT_RUNTIME_UNAVAILABLE",
    `'hotRuntime' cannot run: its worker would load vitest@${worker.version}, ` +
      `but this run is driven by vitest@${project.version}. They talk over Vitest's worker ` +
      `protocol, and a version mismatch reports no results at all rather than failing.\n` +
      `  worker would load:  ${worker.path}\n` +
      `  project resolves:   ${project.path}\n` +
      `This happens when vitest-native and vitest resolve to different node_modules trees ` +
      `(linked packages, hoisted monorepo installs, mixed Vitest versions). Install one ` +
      `Vitest version reachable from vitest-native, or set 'hotRuntime: false'.`,
  );
}

/** Pool initializer for `test.pool` — keeps RN-hot workers alive across files. */
export function nativePool(options: NativePoolOptions): PoolRunnerInitializer {
  assertWorkerVitestMatchesProject(path.resolve(options.workerEntry), options.projectRoot);
  const memoryCoordinator = new NativeMemoryCoordinator();
  return {
    name: "vitest-native",
    createPoolWorker: (poolOptions: PoolOptions) =>
      new NativePoolWorker(poolOptions, options, memoryCoordinator),
  };
}
