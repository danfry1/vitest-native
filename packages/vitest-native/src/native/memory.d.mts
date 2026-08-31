export interface EffectiveMemoryLimit {
  readonly bytes: number | null;
  readonly source: "host" | "constrained" | "unknown";
}

export interface HotMemoryPlan {
  readonly version: 1;
  readonly source: EffectiveMemoryLimit["source"];
  readonly effectiveLimit: number | null;
  readonly softRssLimit: number | null;
  readonly hardRssLimit: number | null;
  readonly requestedWorkers: number;
  readonly admittedWorkers: number;
  readonly maxWorkers: number;
  readonly workerHeapLimit: number;
  readonly mainProcessReserve: number;
  readonly replacementOverlapReserve: number;
}

export declare function effectiveMemoryLimit(input: {
  totalMemory?: number;
  constrainedMemory?: number;
}): EffectiveMemoryLimit;
export declare function defaultRequestedWorkers(parallelism?: number): number;
export declare function resolveRequestedWorkers(
  value: unknown,
  options?: { parallelism?: number; fileParallelism?: boolean },
): number;
export declare function createHotMemoryPlan(input?: {
  totalMemory?: number;
  constrainedMemory?: number;
  requestedWorkers?: number;
}): HotMemoryPlan;
export declare function formatBytes(bytes: number | null | undefined): string;
export declare function formatHotMemoryPlan(plan: HotMemoryPlan): string[];
export declare const hotMemoryConstants: Readonly<{
  MIB: number;
  MIN_WORKER_HEAP: number;
  MAX_WORKER_HEAP: number;
  MAIN_PROCESS_RESERVE: number;
  REPLACEMENT_OVERLAP_RESERVE: number;
  WORKER_RSS_ADMISSION_COST: number;
  MAX_AUTO_WORKERS: number;
}>;
