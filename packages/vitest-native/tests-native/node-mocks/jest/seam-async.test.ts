/**
 * Under jest-compat: a jest.mock whose factory is async is no import's module until it
 * settles; the bridge's seam names it rather than handing over the pending promise.
 */
import path from "node:path";
import { expect, it, vi } from "vitest";

declare const jest: { mock(path: string, factory: () => unknown): void };
type Mocks = { forImport(id: string, importerFile: string): unknown };
const mocks = (globalThis as unknown as Record<symbol, { channel(name: string): Mocks }>)[
  Symbol.for("vitest-native.node-dispatch")
].channel("mocks");

jest.mock("../local-thing", async () => ({ local: "async mock" }));

const localFile = path.join(import.meta.dirname, "..", "local-thing.ts");
const importer = path.join(import.meta.dirname, "bridged.ts");

it("names it while it has not settled", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(() => mocks.forImport(localFile, importer)).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

it("is the module once the test's import has settled it", async () => {
  const imported = await import("../local-thing");
  expect(imported.local).toBe("async mock");
  expect(mocks.forImport(localFile, importer)).toBe(imported);
});
