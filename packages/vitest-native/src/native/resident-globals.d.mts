/** Types for resident-globals.mjs. */
export declare const RESIDENT_GLOBALS: Readonly<{
  bridge: symbol;
  bridged: symbol;
  resolutionMemo: symbol;
}>;
export declare const isResidentGlobal: (key: PropertyKey) => boolean;
export declare function residentGlobal<T>(name: keyof typeof RESIDENT_GLOBALS, create: () => T): T;
