/** Under jest-compat: the bridge's mock seam matches a jest.mock first, as Node's require does. */
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

declare const jest: { mock(path: string, factory: () => unknown): void };
type Mocks = { forImport(id: string, importerFile: string): unknown };
const mocks = (globalThis as unknown as Record<symbol, { channel(name: string): Mocks }>)[
  Symbol.for("vitest-native.node-dispatch")
].channel("mocks");

jest.mock("dispatch-target-lib", () => ({ source: "jest.mock" }));

it("serves the jest.mock, the instance Node's require gets", () => {
  const targetFile = createRequire(import.meta.url).resolve("dispatch-target-lib");
  const served = mocks.forImport(targetFile, path.join(import.meta.dirname, "bridged.ts"));
  expect(served).toBe(requireFrom("dispatch-target-lib"));
  expect((served as { source: string }).source).toBe("jest.mock");
});
