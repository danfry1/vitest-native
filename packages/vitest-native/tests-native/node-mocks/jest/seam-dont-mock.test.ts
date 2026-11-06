/**
 * Under jest-compat: after `jest.dontMock` of a file an earlier `jest.doMock` mocked, Node
 * and the bridge's seam get the real module at once, as under Jest, while Vitest still
 * holds the earlier mock until the test's next import applies the queued unmock.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

declare const jest: {
  doMock(path: string, factory: () => unknown): void;
  dontMock(path: string): void;
  requireActual<T>(p: string): T;
};
type Mocks = { NONE: unknown; forImport(id: string, importerFile: string): unknown };
const mocks = (globalThis as unknown as Record<symbol, { channel(name: string): Mocks }>)[
  Symbol.for("vitest-native.node-dispatch")
].channel("mocks");

const require = createRequire(import.meta.url);
const localFile = path.join(import.meta.dirname, "..", "local-thing.ts");

afterEach(() => {
  jest.dontMock("../local-thing");
});

it("mocks the file for one test", async () => {
  jest.doMock("../local-thing", () => ({
    ...jest.requireActual<Record<string, unknown>>("../local-thing"),
    local: "spread mock",
  }));
  // The test's import registers the doMock with Vitest.
  expect((await import("../local-thing")).local).toBe("spread mock");
});

it("serves the real module in the next test, before any import", () => {
  expect(mocks.forImport(localFile, path.join(import.meta.dirname, "bridged.ts"))).toBe(mocks.NONE);
  expect((require("../reader.cjs") as { read(): string }).read()).toBe("real");
});
