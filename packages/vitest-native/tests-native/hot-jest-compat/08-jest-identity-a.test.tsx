import { jest } from "@jest/globals";
import { expect, it } from "vitest";
// Counted by 99-mocks-nothing, which checks the hot run kept one worker.
import "./surfaces";

// Under Jest, `import { jest } from '@jest/globals'` is the global `jest`. A file may
// also reassign jest.fn; that must not reach the next file in a warm worker. Two
// identical files run this, so whichever goes second checks the first left nothing.
const REASSIGNED = Symbol.for("vitest-native.test.reassigned-jest-fn");

it("is the global jest, with this file's own jest.fn", () => {
  expect(jest).toBe((globalThis as { jest?: unknown }).jest);
  expect((jest.fn as unknown as Record<symbol, unknown>)[REASSIGNED]).toBeUndefined();
  const replacement = Object.assign(() => undefined, { [REASSIGNED]: true });
  (jest as unknown as { fn: unknown }).fn = replacement;
  expect(jest.fn).toBe(replacement);
});
