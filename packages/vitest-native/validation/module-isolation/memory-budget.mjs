const MIB = 1024 * 1024;

const MIN_WORKER_HEAP = 96 * MIB;
const MAX_WORKER_HEAP = 512 * MIB;
const MAIN_PROCESS_RESERVE = 256 * MIB;
const REPLACEMENT_OVERLAP_RESERVE = 192 * MIB;
const WORKER_RSS_ADMISSION_COST = 256 * MIB;
// The 406-file RNTL curve flattened at four: 2.15s / 988MiB versus
// 2.03s / 1.50GiB at eight. More workers remain an explicit user choice.
const MAX_AUTO_WORKERS = 4;

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function effectiveMemoryLimit({ totalMemory, constrainedMemory }) {
  const total = finitePositive(totalMemory);
  const constrained = finitePositive(constrainedMemory);
  if (!total && !constrained) return null;
  if (!total) return constrained;
  if (!constrained) return total;
  return Math.min(total, constrained);
}

/**
 * Candidate policy derived from the module-isolation scale experiments.
 *
 * This is deliberately a validation model, not production API. It reserves memory
 * for Vite's main graph and for the brief old/new worker overlap in Vitest's current
 * asynchronous recycling path, then caps both concurrency and worker-local heap.
 */
export function memoryPlan({ totalMemory, constrainedMemory, requestedWorkers }) {
  const limit = effectiveMemoryLimit({ totalMemory, constrainedMemory });
  if (!limit) {
    return {
      limit: null,
      softRssLimit: null,
      hardRssLimit: null,
      maxWorkers: Math.max(1, requestedWorkers),
      workerHeapLimit: 256 * MIB,
    };
  }

  const softRssLimit = Math.floor(limit * 0.8);
  const hardRssLimit = Math.floor(limit * 0.9);
  const workerEnvelope = Math.max(
    0,
    softRssLimit - MAIN_PROCESS_RESERVE - REPLACEMENT_OVERLAP_RESERVE,
  );
  const admittedWorkers = Math.max(
    1,
    Math.min(MAX_AUTO_WORKERS, Math.floor(workerEnvelope / WORKER_RSS_ADMISSION_COST)),
  );
  const maxWorkers = Math.max(1, Math.min(requestedWorkers, admittedWorkers));
  const perWorkerEnvelope = workerEnvelope / maxWorkers;
  const workerHeapLimit = Math.min(
    MAX_WORKER_HEAP,
    Math.max(MIN_WORKER_HEAP, Math.floor(perWorkerEnvelope * 0.65)),
  );

  return { limit, softRssLimit, hardRssLimit, maxWorkers, workerHeapLimit };
}

export const memoryBudgetConstants = {
  MIB,
  MIN_WORKER_HEAP,
  MAX_WORKER_HEAP,
  MAIN_PROCESS_RESERVE,
  REPLACEMENT_OVERLAP_RESERVE,
  WORKER_RSS_ADMISSION_COST,
  MAX_AUTO_WORKERS,
};
