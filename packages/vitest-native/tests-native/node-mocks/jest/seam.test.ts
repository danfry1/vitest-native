/**
 * Under jest-compat: the bridge's mock seam matches a jest.mock first, and gives it as an
 * import gets it (Jest's CommonJS interop: a default import reads the whole module),
 * not as `require` does.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

declare const jest: { mock(path: string, factory: () => unknown): void };
type Mocks = { NONE: symbol; forImport(id: string, importerFile: string): unknown };
const mocks = (globalThis as unknown as Record<symbol, { channel(name: string): Mocks }>)[
  Symbol.for("vitest-native.node-dispatch")
].channel("mocks");

const require = createRequire(import.meta.url);
const importer = path.join(import.meta.dirname, "bridged.ts");

jest.mock("dispatch-target-lib", () => ({ source: "jest.mock" }));
jest.mock(
  "dispatch-redirect-lib",
  () =>
    function Component() {
      return "mock component";
    },
);

it("gives a named-only factory's module as its default, and its names", () => {
  const served = mocks.forImport(require.resolve("dispatch-target-lib"), importer) as {
    source: string;
    default: { source: string };
  };
  expect(served.source).toBe("jest.mock");
  expect(served.default.source).toBe("jest.mock");
});

it("gives a factory returning a function as the default import", () => {
  const served = mocks.forImport(require.resolve("dispatch-redirect-lib"), importer) as {
    default: () => string;
  };
  expect(served.default()).toBe("mock component");
});

it("is the test's own import once it has run", async () => {
  const imported = await import("dispatch-target-lib");
  expect(mocks.forImport(require.resolve("dispatch-target-lib"), importer)).toBe(imported);
});
