// `@jest/globals` shim — re-exports Vitest globals and maps `jest` -> `vi`.
export { expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
export declare const jest: typeof import("vitest").vi;
