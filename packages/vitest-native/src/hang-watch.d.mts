export declare const DEFAULT_HANG_TIMEOUT: number;
export declare function hangTimeoutFor(
  option: number | false | undefined,
  timeouts?: { testTimeout?: number; hookTimeout?: number },
): number | null;
export declare function debugging(
  config?: { inspect?: unknown; inspectBrk?: unknown },
  execArgv?: readonly string[],
  inspectorUrl?: string,
): boolean;
export declare class HangWatch {
  constructor(options: {
    timeoutMs: number;
    exit?: (code: number) => void;
    write?: (text: string) => void;
  });
  readonly running: Map<string, string | null>;
  onTestRunStart(): void;
  onTestModuleStart(testModule: { moduleId: string }): void;
  onTestCaseReady(testCase: { module: { moduleId: string }; fullName: string }): void;
  onTestCaseResult(testCase: { module: { moduleId: string }; fullName: string }): void;
  onTestModuleEnd(testModule: { moduleId: string }): void;
  onTestRunEnd(): void;
  report(): string[];
}
