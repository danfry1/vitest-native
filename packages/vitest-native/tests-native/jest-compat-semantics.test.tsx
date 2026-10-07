/**
 * Jest semantics the compat layer reproduces, end to end: a `jest.mock` factory passed
 * through jestMockTransform, the `jest` global from the compat setup, and app modules
 * importing what the factories mock. Each case is a shape found by running a real
 * Jest-era app suite (Expo, jest-expo) through the migration, which passed under Jest
 * and failed here.
 */
import { describe, expect, it, vi } from "vitest";

declare const jest: typeof vi;

// A getter reading a `let` the test declares below. The factory runs during the
// hoisted imports, before `mockIsWeb` is initialised; Jest reads `IS_WEB` only when
// the app does. The factory also leaves `PROXY_DID` out, which the app imports.
let mockIsWeb = false;
jest.mock("./fixtures/jest-semantics/env", () => ({
  get IS_WEB() {
    return mockIsWeb;
  },
}));

// A class replaced by a `jest.fn` with an arrow implementation, then constructed by
// the app with `new`.
const mockFetch = jest.fn(() => "mocked-feed");
jest.mock("./fixtures/jest-semantics/feed", () => ({
  FeedApi: jest.fn().mockImplementation(() => ({ fetch: mockFetch })),
}));

// A plain vi.mock keeps Vitest's own strict missing-export check.
vi.mock("./fixtures/jest-semantics/strict", () => ({ present: "mocked-present" }));

import { proxyDid, textDirection } from "./fixtures/jest-semantics/direction";
import { FeedApi } from "./fixtures/jest-semantics/feed";
import { loadFeed } from "./fixtures/jest-semantics/load-feed";
import * as strict from "./fixtures/jest-semantics/strict";

describe("jest.mock factories (jestMockTransform)", () => {
  it("a getter in a factory is read when the app reads it, not when the factory runs", () => {
    expect(textDirection()).toBe("native");
    mockIsWeb = true;
    expect(textDirection()).toBe("web");
    mockIsWeb = false;
  });

  it("an export the factory leaves out is undefined, as in Jest", () => {
    expect(proxyDid()).toBeUndefined();
  });

  it("a vi.mock factory keeps Vitest's missing-export error", () => {
    expect(strict.present).toBe("mocked-present");
    expect(() => (strict as Record<string, unknown>).absent).toThrow(
      /No "absent" export is defined/,
    );
  });
});

describe("jest.fn under `new`", () => {
  it("returns the object an arrow implementation returns", () => {
    expect(loadFeed()).toBe("mocked-feed");
    expect(vi.isMockFunction(FeedApi)).toBe(true);
    expect(FeedApi).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("process.env.JEST_WORKER_ID", () => {
  it("is set to the 1-based worker id, as Jest sets it", () => {
    expect(process.env.JEST_WORKER_ID).toBe(process.env.VITEST_POOL_ID);
    expect(Number(process.env.JEST_WORKER_ID)).toBeGreaterThanOrEqual(1);
  });
});
