export declare const DEFAULT_HANG_TIMEOUT: number;
export declare const MAX_HANG_TIMEOUT: number;
export declare function hangTimeoutFor(
  option: number | false | undefined,
  timeouts?: { testTimeout?: number; hookTimeout?: number },
): number | null;
export declare function debugging(
  configs?: readonly (
    | { inspect?: unknown; inspectBrk?: unknown; execArgv?: readonly string[] }
    | undefined
  )[],
  execArgv?: readonly string[],
  inspectorUrl?: string,
): boolean;
export declare function descendantsOf(pid: number): number[];
export interface HangTestRecord {
  file: string | null;
  test: string;
  at: number;
  timeout?: number;
  hookTimeout?: number;
  debugger?: boolean;
}
export declare function testBudget(record: HangTestRecord): number;
export declare function readTestRecords(dir: string | undefined): Map<string, HangTestRecord>;
export declare function runByCli(argv?: readonly string[]): boolean;
export declare function exitKillingDescendants(code: number): never;
export declare class HangWatch {
  constructor(options: {
    timeoutMs: number | null;
    recordsDir?: string;
    exit?: (code: number) => void;
    write?: (text: string) => void;
    now?: () => number;
    cli?: boolean;
    graceMs?: number;
  });
  timeoutMs: number | null;
  readonly recordsDir: string | undefined;
  /** A module was loaded for a worker: progress while a file is still importing. */
  activity(): void;
  active: boolean;
  off: boolean;
  readonly running: Map<string, string | null>;
  contribute(say?: { off?: boolean; active?: boolean; limit?: number | null }): void;
  watching(): boolean;
  onInit(vitest: unknown): void;
  onTestRunStart(): void;
  onTestModuleQueued(testModule: { moduleId: string }): void;
  onTestModuleStart(testModule: { moduleId: string }): void;
  onTestCaseReady(testCase: { module: { moduleId: string }; fullName: string }): void;
  onTestCaseResult(testCase: { module: { moduleId: string }; fullName: string }): void;
  onTestModuleEnd(testModule: { moduleId: string }): void;
  onTestRunEnd(): void;
  check(): void;
  report(records?: Map<string, HangTestRecord>): string[];
  trip(records?: Map<string, HangTestRecord>): Promise<void>;
}
