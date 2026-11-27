// Memory planning for the persistent native runtime.
//
// The hot pool uses worker threads, so `heapUsed` is worker-local while RSS is
// process-wide. A safe plan therefore has two layers: recycle individual workers
// on heap growth, and guard the whole process against its effective host/cgroup
// limit. Keep this module side-effect free so config, pool, doctor and tests all
// consume the same arithmetic.
import childProcess from "node:child_process";
import os from "node:os";

const MIB = 1024 * 1024;
const MIN_WORKER_HEAP = 96 * MIB;
const MAX_WORKER_HEAP = 512 * MIB;
const MAIN_PROCESS_RESERVE = 256 * MIB;
const REPLACEMENT_OVERLAP_RESERVE = 192 * MIB;
const WORKER_RSS_ADMISSION_COST = 256 * MIB;
// The automatic count where the OS reports no core classes (#906).
const DEFAULT_AUTO_WORKERS = 4;

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function effectiveMemoryLimit({ totalMemory, constrainedMemory }) {
  const total = finitePositive(totalMemory);
  const constrained = finitePositive(constrainedMemory);
  if (total === null && constrained === null) return { bytes: null, source: "unknown" };
  if (total === null) return { bytes: constrained, source: "constrained" };
  if (constrained === null || total <= constrained) return { bytes: total, source: "host" };
  return { bytes: constrained, source: "constrained" };
}

/**
 * `sysctl -n` for each name, one value per line, or null when any name is unknown (an
 * Intel Mac has no `hw.perflevel*`) or sysctl cannot run. Called through the
 * child_process object so tests can stand in for the host.
 */
function readSysctl(names) {
  const result = childProcess.spawnSync("/usr/sbin/sysctl", ["-n", ...names], {
    encoding: "utf8",
    timeout: 2000,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  const lines = result.stdout.trim().split("\n");
  return lines.length === names.length ? lines : null;
}

/**
 * The host's performance cores, where the OS reports core classes, else null. macOS on
 * Apple silicon reports them as `hw.perflevel0.physicalcpu` with `hw.nperflevels` of 2
 * or more; a single level (a virtual machine, say) is no split. Linux reports no core
 * classes inside the containers tests run in, so it takes the fallback.
 */
export function hostPerformanceCores({ platform = process.platform, sysctl = readSysctl } = {}) {
  if (platform !== "darwin") return null;
  const values = sysctl(["hw.nperflevels", "hw.perflevel0.physicalcpu"]);
  if (values === null) return null;
  const [levels, performance] = values.map((value) => Number(value));
  if (!Number.isInteger(levels) || levels < 2) return null;
  return Number.isInteger(performance) && performance > 0 ? performance : null;
}

/**
 * The worker count the hot runtime chooses when nobody set one: the host's performance
 * cores, where the OS reports them, else four. On the suites measured for #906 the
 * fastest count equalled the performance cores (6 on 6P+6E, 4 on 4P+6E); more workers
 * spill onto efficiency cores and cost CPU for no time. Never below two, the fewest the
 * hot runtime can recycle with. The memory plan still bounds it.
 */
export function hostAutoWorkers(input) {
  const cores = hostPerformanceCores(input);
  return cores === null
    ? { count: DEFAULT_AUTO_WORKERS, source: "default" }
    : { count: Math.max(2, cores), source: "performance-cores" };
}

export function defaultRequestedWorkers(
  parallelism = os.availableParallelism?.() ?? os.cpus().length,
) {
  return Math.max(1, Math.floor(parallelism) - 1);
}

/** Resolve Vitest's number/percentage worker option without importing Vitest internals. */
export function resolveRequestedWorkers(value, { parallelism, fileParallelism = true } = {}) {
  if (fileParallelism === false) return 1;
  const cpus = Math.max(
    1,
    Math.floor(parallelism ?? os.availableParallelism?.() ?? os.cpus().length),
  );
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+(?:\.\d+)?%$/.test(trimmed)) {
      return Math.max(1, Math.floor((cpus * Number.parseFloat(trimmed)) / 100));
    }
    if (/^\d+$/.test(trimmed)) return Math.max(1, Number.parseInt(trimmed, 10));
  }
  return Math.max(1, cpus - 1);
}

/**
 * Compute the hot-runtime envelope.
 *
 * The reserves were earned by the packed 406-file RNTL experiment. They are
 * conservative defaults, not portable benchmark claims.
 *
 * The automatic count (hostAutoWorkers: the performance cores, else four) bounds the
 * AUTOMATIC choice only. It is where a default stops paying for its memory and CPU, not
 * a safety limit (validation/module-isolation/README.md, "Worker-count curve"; #906).
 * A worker count the user set (`maxWorkers` in config, `--maxWorkers`,
 * `VITEST_MAX_WORKERS`) is therefore admitted up to what the memory envelope holds, the
 * bound that does protect the process. With no known memory limit nothing can admit
 * more than the automatic count, so it applies there either way.
 */
export function createHotMemoryPlan({
  totalMemory = os.totalmem(),
  constrainedMemory = process.constrainedMemory?.() ?? 0,
  requestedWorkers = defaultRequestedWorkers(),
  explicitWorkers = false,
  autoWorkers,
} = {}) {
  const effective = effectiveMemoryLimit({ totalMemory, constrainedMemory });
  const requested = Math.max(1, Math.floor(requestedWorkers));
  // Read the host only when the automatic count can decide: a count the user set with
  // a known memory limit is bounded by memory alone.
  const auto =
    autoWorkers ??
    (explicitWorkers && effective.bytes !== null
      ? { count: null, source: "not-used" }
      : hostAutoWorkers());
  if (effective.bytes === null) {
    return Object.freeze({
      version: 1,
      source: effective.source,
      effectiveLimit: null,
      softRssLimit: null,
      hardRssLimit: null,
      requestedWorkers: requested,
      autoWorkers: auto.count,
      autoWorkersSource: auto.source,
      admittedWorkers: Math.min(auto.count, requested),
      maxWorkers: Math.min(auto.count, requested),
      workerHeapLimit: 256 * MIB,
      mainProcessReserve: MAIN_PROCESS_RESERVE,
      replacementOverlapReserve: REPLACEMENT_OVERLAP_RESERVE,
    });
  }

  const softRssLimit = Math.floor(effective.bytes * 0.8);
  const hardRssLimit = Math.floor(effective.bytes * 0.9);
  const workerEnvelope = Math.max(
    0,
    softRssLimit - MAIN_PROCESS_RESERVE - REPLACEMENT_OVERLAP_RESERVE,
  );
  const memoryAdmits = Math.floor(workerEnvelope / WORKER_RSS_ADMISSION_COST);
  const admittedWorkers = Math.max(
    1,
    explicitWorkers ? memoryAdmits : Math.min(auto.count, memoryAdmits),
  );
  const maxWorkers = Math.min(requested, admittedWorkers);
  const perWorkerEnvelope = workerEnvelope / maxWorkers;
  const workerHeapLimit = Math.min(
    MAX_WORKER_HEAP,
    Math.max(MIN_WORKER_HEAP, Math.floor(perWorkerEnvelope * 0.65)),
  );

  return Object.freeze({
    version: 1,
    source: effective.source,
    effectiveLimit: effective.bytes,
    softRssLimit,
    hardRssLimit,
    requestedWorkers: requested,
    autoWorkers: auto.count,
    autoWorkersSource: auto.source,
    admittedWorkers,
    maxWorkers,
    workerHeapLimit,
    mainProcessReserve: MAIN_PROCESS_RESERVE,
    replacementOverlapReserve: REPLACEMENT_OVERLAP_RESERVE,
  });
}

export function formatBytes(bytes) {
  if (bytes == null) return "unknown";
  return `${Math.round(bytes / MIB)} MiB`;
}

/**
 * The count the plan runs when memory is what held it below the count requested, else
 * null: the plan runs what was requested, or the automatic count chose, which a count
 * the user sets lifts and which is not about memory. What memory alone admits
 * comes from the plan's own figures (createHotMemoryPlan).
 */
export function memoryLoweredWorkers(plan) {
  if (plan.maxWorkers >= plan.requestedWorkers || plan.softRssLimit == null) return null;
  const memoryAdmits = Math.max(
    1,
    Math.floor(
      Math.max(0, plan.softRssLimit - plan.mainProcessReserve - plan.replacementOverlapReserve) /
        WORKER_RSS_ADMISSION_COST,
    ),
  );
  return plan.admittedWorkers < memoryAdmits ? null : plan.maxWorkers;
}

/**
 * The hot runtime's worker decision as one line of the startup log, so a user can tune
 * `maxWorkers` or report a run without turning diagnostics on (formatHotMemoryPlan has
 * the full envelope).
 */
export function formatHotWorkerDecision(plan) {
  const memory =
    plan.effectiveLimit == null
      ? "memory unknown"
      : `${formatBytes(plan.effectiveLimit)} ${plan.source === "constrained" ? "memory limit" : "host memory"}`;
  if (plan.maxWorkers < plan.requestedWorkers) {
    // Say which of memory and the automatic cap chose the number, since only one of
    // them is about memory.
    if (memoryLoweredWorkers(plan) === null) {
      return `workers: ${plan.maxWorkers} (automatic: ${describeAutoWorkers(plan)}; ${plan.requestedWorkers} available, set maxWorkers to run more; ${memory})`;
    }
    return `workers: ${plan.maxWorkers} (memory plan admitted ${plan.admittedWorkers} of ${plan.requestedWorkers} requested, ${memory})`;
  }
  return `workers: ${plan.maxWorkers} (as requested; memory plan admits up to ${plan.admittedWorkers}, ${memory})`;
}

/** How the automatic count was chosen, for the startup line and the full plan. */
function describeAutoWorkers(plan) {
  if (plan.autoWorkersSource === "performance-cores") {
    return `${plan.autoWorkers}, the host's performance cores`;
  }
  if (plan.autoWorkersSource === "default") {
    return `${plan.autoWorkers}, the default where the OS reports no performance cores`;
  }
  return "not used, the worker count was set";
}

export function formatHotMemoryPlan(plan) {
  return [
    `effective limit: ${formatBytes(plan.effectiveLimit)} (${plan.source})`,
    `RSS soft/hard: ${formatBytes(plan.softRssLimit)} / ${formatBytes(plan.hardRssLimit)}`,
    `workers requested/admitted/selected: ${plan.requestedWorkers} / ${plan.admittedWorkers} / ${plan.maxWorkers}`,
    `automatic worker count: ${describeAutoWorkers(plan)}`,
    `worker heap recycle threshold: ${formatBytes(plan.workerHeapLimit)}`,
    `reserves main/replacement: ${formatBytes(plan.mainProcessReserve)} / ${formatBytes(plan.replacementOverlapReserve)}`,
  ];
}

export const hotMemoryConstants = Object.freeze({
  MIB,
  MIN_WORKER_HEAP,
  MAX_WORKER_HEAP,
  MAIN_PROCESS_RESERVE,
  REPLACEMENT_OVERLAP_RESERVE,
  WORKER_RSS_ADMISSION_COST,
  DEFAULT_AUTO_WORKERS,
});
