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
export declare function exitKillingDescendants(code: number): never;
export declare class HangWatch {
  constructor(options: {
    timeoutMs: number | null;
    exit?: (code: number) => void;
    write?: (text: string) => void;
  });
  timeoutMs: number | null;
  readonly running: Map<string, string | null>;
  merge(timeoutMs: number | null): void;
  onTestRunStart(): void;
  onTestModuleQueued(testModule: { moduleId: string }): void;
  onTestModuleStart(testModule: { moduleId: string }): void;
  onTestCaseReady(testCase: { module: { moduleId: string }; fullName: string }): void;
  onTestCaseResult(testCase: { module: { moduleId: string }; fullName: string }): void;
  onTestModuleEnd(testModule: { moduleId: string }): void;
  onTestRunEnd(): void;
  report(): string[];
}
