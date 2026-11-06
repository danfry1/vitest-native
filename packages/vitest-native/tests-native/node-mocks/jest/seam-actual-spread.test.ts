/**
 * Under jest-compat: a jest.mock factory that spreads jest.requireActual of project source,
 * which jestMockTransform makes async for Vite, is served synchronously to the bridge's
 * seam, as Jest serves it; Vite's later import gets the same object.
 */
import path from "node:path";
import { expect, it } from "vitest";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T>(p: string): T;
};
type Mocks = { forImport(id: string, importerFile: string): unknown };
const mocks = (globalThis as unknown as Record<symbol, { channel(name: string): Mocks }>)[
  Symbol.for("vitest-native.node-dispatch")
].channel("mocks");

jest.mock("../local-thing", () => ({
  ...jest.requireActual<Record<string, unknown>>("../local-thing"),
  local: "spread mock",
}));

const localFile = path.join(import.meta.dirname, "..", "local-thing.ts");

it("serves it before the test's own import, and that import gets the same module", async () => {
  const served = mocks.forImport(localFile, path.join(import.meta.dirname, "bridged.ts")) as {
    local: string;
  };
  expect(served.local).toBe("spread mock");
  const imported = await import("../local-thing");
  expect(imported.local).toBe("spread mock");
});
