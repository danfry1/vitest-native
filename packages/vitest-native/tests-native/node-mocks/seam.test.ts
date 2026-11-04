/**
 * The mock seam of the require bridge (ownershipModel 'resolution'): what the bridge asks
 * for each import a Vite-owned module it evaluates makes. The test calls it as the bridge
 * does, with Vite's id for the dependency and the importer's file.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import * as target from "dispatch-target-lib";
import * as auto from "dispatch-redirect-lib";
import "./local-thing";

type Mocks = {
  NONE: symbol;
  servesNode: boolean;
  forImport(id: string, importerFile: string): unknown;
};
const mocks = (globalThis as unknown as Record<symbol, { channel(name: string): Mocks }>)[
  Symbol.for("vitest-native.node-dispatch")
].channel("mocks");

const require = createRequire(import.meta.url);
const targetFile = require.resolve("dispatch-target-lib");
const splitFile = require.resolve("dispatch-split-lib");
const importer = path.join(import.meta.dirname, "bridged-module.ts");

vi.mock("dispatch-target-lib", () => ({ source: "mock" }));
vi.mock("dispatch-redirect-lib", { spy: true });

it("is the instance the test's import gets, for a factory and an autospy", () => {
  expect(mocks.forImport(targetFile, importer)).toBe(target);
  const spied = mocks.forImport(require.resolve("dispatch-redirect-lib"), importer) as typeof auto;
  expect(spied.source).toBe(auto.source);
});

it("finds a mocked external by the forms the bridge holds its id in", () => {
  // An installed package Vitest externalizes: the bridge has its externalize target, an
  // absolute path, or a file: URL on Windows; a module outside the root arrives as /@fs/.
  expect(mocks.forImport(pathToFileURL(targetFile).href, importer)).toBe(target);
  expect(
    mocks.forImport(
      `/@fs${targetFile.replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`,
      importer,
    ),
  ).toBe(target);
});

it("is NONE for a dependency no mock applies to", () => {
  expect(mocks.forImport(splitFile, importer)).toBe(mocks.NONE);
  expect(mocks.forImport("node:path", importer)).toBe(mocks.NONE);
});

it("names a pending vi.doMock of the dependency, with the importer", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const localFile = path.join(import.meta.dirname, "local-thing.ts");
  vi.doMock("./local-thing", () => ({ local: "pending" }));
  expect(() => mocks.forImport(localFile, importer)).toThrow(
    expect.objectContaining({
      code: "MOCK_NOT_SEEN_BY_NODE",
      message: expect.stringContaining(importer),
    }),
  );
  const imported = await import("./local-thing");
  expect(mocks.forImport(localFile, importer)).toBe(imported);
});

it("says whether Node itself is served mocks", () => {
  expect(mocks.servesNode).toBe(true);
});
