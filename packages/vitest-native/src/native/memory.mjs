// Memory planning for the persistent native runtime.
//
// The hot pool uses worker threads, so `heapUsed` is worker-local while RSS is
// process-wide. A safe plan therefore has two layers: recycle individual workers
// on heap growth, and guard the whole process against its effective host/cgroup
// limit. Keep this module side-effect free so config, pool, doctor and tests all
// consume the same arithmetic.
import os from "node:os";

const MIB = 1024 * 1024;
const MIN_WORKER_HEAP = 96 * MIB;
const MAX_WORKER_HEAP = 512 * MIB;
const MAIN_PROCESS_RESERVE = 256 * MIB;
const REPLACEMENT_OVERLAP_RESERVE = 192 * MIB;
const WORKER_RSS_ADMISSION_COST = 256 * MIB;
const MAX_AUTO_WORKERS = 4;

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
 * Compute the automatic hot-runtime envelope.
 *
 * The reserves and four-worker cap were earned by the packed 406-file RNTL
 * experiment. They are conservative defaults, not portable benchmark claims.
 */
export function createHotMemoryPlan({
  totalMemory = os.totalmem(),
  constrainedMemory = process.constrainedMemory?.() ?? 0,
  requestedWorkers = defaultRequestedWorkers(),
} = {}) {
  const effective = effectiveMemoryLimit({ totalMemory, constrainedMemory });
  const requested = Math.max(1, Math.floor(requestedWorkers));
  if (effective.bytes === null) {
    return Object.freeze({
      version: 1,
      source: effective.source,
      effectiveLimit: null,
      softRssLimit: null,
      hardRssLimit: null,
      requestedWorkers: requested,
      admittedWorkers: Math.min(MAX_AUTO_WORKERS, requested),
      maxWorkers: Math.min(MAX_AUTO_WORKERS, requested),
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
  const admittedWorkers = Math.max(
    1,
    Math.min(MAX_AUTO_WORKERS, Math.floor(workerEnvelope / WORKER_RSS_ADMISSION_COST)),
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

export function formatHotMemoryPlan(plan) {
  return [
    `effective limit: ${formatBytes(plan.effectiveLimit)} (${plan.source})`,
    `RSS soft/hard: ${formatBytes(plan.softRssLimit)} / ${formatBytes(plan.hardRssLimit)}`,
    `workers requested/admitted/selected: ${plan.requestedWorkers} / ${plan.admittedWorkers} / ${plan.maxWorkers}`,
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
  MAX_AUTO_WORKERS,
});
