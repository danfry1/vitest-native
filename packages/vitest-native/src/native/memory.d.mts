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
  /** The count the plan chooses when nobody set one; null when a set count made it moot. */
  readonly autoWorkers: number | null;
  readonly autoWorkersSource: AutoWorkers["source"];
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
export interface AutoWorkers {
  readonly count: number | null;
  /** performance-cores: read from the host; default: no core classes reported. */
  readonly source: "performance-cores" | "default" | "not-used";
}

type SysctlReader = (names: readonly string[]) => readonly string[] | null;
export declare function hostPerformanceCores(input?: {
  platform?: string;
  sysctl?: SysctlReader;
}): number | null;
export declare function hostAutoWorkers(input?: {
  platform?: string;
  sysctl?: SysctlReader;
}): AutoWorkers;
export declare function defaultRequestedWorkers(parallelism?: number): number;
export declare function resolveRequestedWorkers(
  value: unknown,
  options?: { parallelism?: number; fileParallelism?: boolean },
): number;
export declare function createHotMemoryPlan(input?: {
  totalMemory?: number;
  constrainedMemory?: number;
  requestedWorkers?: number;
  /** The user set the worker count, so only memory, not the automatic cap, bounds it. */
  explicitWorkers?: boolean;
  /** The automatic count; read from the host (hostAutoWorkers) when omitted. */
  autoWorkers?: AutoWorkers;
}): HotMemoryPlan;
export declare function formatBytes(bytes: number | null | undefined): string;
export declare function formatHotMemoryPlan(plan: HotMemoryPlan): string[];
export declare function formatHotWorkerDecision(plan: HotMemoryPlan): string;
export declare function memoryLoweredWorkers(plan: HotMemoryPlan): number | null;
export declare const hotMemoryConstants: Readonly<{
  MIB: number;
  MIN_WORKER_HEAP: number;
  MAX_WORKER_HEAP: number;
  MAIN_PROCESS_RESERVE: number;
  REPLACEMENT_OVERLAP_RESERVE: number;
  WORKER_RSS_ADMISSION_COST: number;
  DEFAULT_AUTO_WORKERS: number;
}>;
