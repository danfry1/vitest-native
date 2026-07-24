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
import os from "node:os";
import { createRequire } from "node:module";
import { ThreadsPoolWorker } from "vitest/node";
import type { PoolOptions, PoolRunnerInitializer, PoolTask, WorkerRequest } from "vitest/node";

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
      if (
        !this.batchWarningShown &&
        message.context.files.length > 1 &&
        (this.recycleAfterFiles > 0 || this.memoryLimit > 0)
      ) {
        this.batchWarningShown = true;
        console.warn(
          `[vitest-native] hotRuntime recycling (memoryLimit/recycleAfterFiles) is INACTIVE ` +
            `here: Vitest batched ${message.context.files.length} files into one task, which ` +
            `happens in single-worker mode (maxWorkers: 1) — so a worker can never be retired ` +
            `between files and the memory bound cannot be enforced. Run with maxWorkers >= 2 ` +
            `(or remove maxWorkers/fileParallelism: false) so each file is its own task and ` +
            `recycling can fire.`,
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

// Per-worker memory bound applied by default when hot is enabled but the user
// configured no explicit recycling. Hot workers hold React Native resident and
// accumulate ~4 MB/file (RNTL's resident render trees can't be reclaimed across
// files), so unbounded single-worker hot heads toward OOM at large file counts.
// A per-worker `memoryLimit` lets multi-worker runs recycle a worker once its
// heap crosses the ceiling, keeping total hot memory bounded regardless of suite
// size. The bounds:
//  - FLOOR (768 MB): a per-worker limit below RN's resident working set
//    (~417 MB/worker measured @8w, plus headroom) would recycle every few files
//    and thrash. 768 MB sits safely above it.
//  - CEILING (1.5 GB): above this there's no practical point bounding on typical
//    dev/CI machines.
//  - FRACTION (0.25): scale the budget with machine size between those bounds.
// Single-worker hot can't recycle at all (Vitest batches all files into one task),
// so the bound is inert there — the pool's batch warning nudges users to >=2 workers.
const HOT_MEMORY_MIN_BYTES = 768 * 1024 * 1024;
const HOT_MEMORY_MAX_BYTES = 1536 * 1024 * 1024;
const HOT_MEMORY_FRACTION = 0.25;

/**
 * Default per-worker hot `memoryLimit` (bytes): `clamp(totalmem * 0.25, 768MB, 1.5GB)`.
 * Applied only when hot is enabled and neither `memoryLimit` nor
 * `recycleAfterFiles` was set explicitly. `totalmem` is injectable for tests.
 */
export function defaultHotMemoryLimit(totalmem: number = os.totalmem()): number {
  const budget = Math.floor(totalmem * HOT_MEMORY_FRACTION);
  return Math.min(HOT_MEMORY_MAX_BYTES, Math.max(HOT_MEMORY_MIN_BYTES, budget));
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
  throw new Error(
    `[vitest-native] 'hotRuntime' cannot run: its worker would load vitest@${worker.version}, ` +
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
  return {
    name: "vitest-native",
    createPoolWorker: (poolOptions: PoolOptions) => new NativePoolWorker(poolOptions, options),
  };
}
