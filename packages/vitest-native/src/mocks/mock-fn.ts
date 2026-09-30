import { vi, type Mock } from "vitest";

/**
 * `vi.fn()` with no implementation, typed so declaration emit can name it. A bare
 * `vi.fn()` infers `Mock<Procedure>`, and Vitest does not export `Procedure`, so
 * TypeScript 7 refuses to emit the inferred type of any factory that returns one
 * (TS2883). `vi.fn(impl)` infers from the implementation and needs no help.
 */
export function mockFn(): Mock<(...args: any[]) => any> {
  return vi.fn();
}
