/**
 * Under jest-compat: a jest.mock factory that spreads jest.requireActual of project source,
 * which jestMockTransform makes async for Vite, is served synchronously to the bridge's
 * seam, as Jest serves it; Vite's later import gets the same object.
 */
import path from "node:path";
import { beforeAll, expect, it } from "vitest";
import { COLD_IMPORT_BUDGET_MS } from "../../support/cold-import";

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

// Serving it runs the factory, whose requireActual is this worker's first compile of a
// TypeScript file: cold on a fresh runner (it has taken 2 s on Windows). Still before the
// test's own import, which is what the test is about.
let served: { local: string };
beforeAll(() => {
  served = mocks.forImport(localFile, path.join(import.meta.dirname, "bridged.ts")) as {
    local: string;
  };
}, COLD_IMPORT_BUDGET_MS);

it("serves it before the test's own import, and that import gets the same module", async () => {
  expect(served.local).toBe("spread mock");
  const imported = await import("../local-thing");
  expect(imported.local).toBe("spread mock");
});
