/**
 * Under the hot runtime, a matcher one file adds with `expect.extend` stayed for every
 * later file on the worker (#808). The hot reset puts the shared matcher objects back to
 * their state at the worker's start (src/native/expect-matchers.mjs).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  captureMatchers,
  matcherDifference,
  restoreMatchers,
  type MatcherSnapshot,
} from "../src/native/expect-matchers.mjs";

type Loose = Record<string, (...args: unknown[]) => unknown>;
let snapshot: MatcherSnapshot | undefined;
afterEach(() => {
  if (snapshot) restoreMatchers(snapshot);
  snapshot = undefined;
});

describe("the hot reset's matcher state", () => {
  it("removes a matcher added since the capture, in every form expect.extend gives it", () => {
    snapshot = captureMatchers(expect);
    expect(matcherDifference(snapshot)).toBeNull();
    expect.extend({ toBeLeaked: () => ({ pass: true, message: () => "" }) });
    expect(matcherDifference(snapshot)).toMatch(/added since the worker started: toBeLeaked/);

    restoreMatchers(snapshot);
    expect(matcherDifference(snapshot)).toBeNull();
    expect(() => (expect(1) as unknown as Loose).toBeLeaked()).toThrow();
    expect(
      (globalThis as unknown as Record<symbol, Record<string, unknown>>)[
        Symbol.for("asymmetric-matchers-object")
      ].toBeLeaked,
    ).toBeUndefined();
    expect(
      (globalThis as unknown as Record<symbol, { matchers: Record<string, unknown> }>)[
        Symbol.for("$$jest-matchers-object")
      ].matchers.toBeLeaked,
    ).toBeUndefined();
  });

  it("puts back a built-in matcher a file replaced", () => {
    snapshot = captureMatchers(expect);
    expect.extend({ toBe: () => ({ pass: true, message: () => "" }) });
    expect(() => expect(1).toBe(2)).not.toThrow();
    expect(matcherDifference(snapshot)).toMatch(/(added|replaced) since the worker started: toBe$/);

    restoreMatchers(snapshot);
    expect(() => expect(1).toBe(2)).toThrow();
  });

  it("removes equality testers added since the capture", () => {
    snapshot = captureMatchers(expect);
    expect.addEqualityTesters([
      (a, b) => (typeof a === "number" && typeof b === "number" ? true : undefined),
    ]);
    expect(1).toEqual(2);
    expect(matcherDifference(snapshot)).toMatch(/equality testers/);

    restoreMatchers(snapshot);
    expect(1).not.toEqual(2);
    expect(matcherDifference(snapshot)).toBeNull();
  });
});
