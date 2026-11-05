/**
 * Under jest-compat: a jest.mock factory that spreads jest.requireActual of project source
 * (jestMockTransform makes Vite's copy of it async) is served to Node's require of the
 * file, as Jest serves it.
 */
import { createRequire } from "node:module";
import { expect, it } from "vitest";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T>(p: string): T;
};

jest.mock("../local-thing", () => ({
  ...jest.requireActual<Record<string, unknown>>("../local-thing"),
  local: "spread mock",
}));

it("serves the mock to a project module's require", () => {
  const reader = createRequire(import.meta.url)("../reader.cjs");
  expect(reader.read()).toBe("spread mock");
});
