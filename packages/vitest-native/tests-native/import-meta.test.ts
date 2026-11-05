/**
 * `import.meta` on both sides of the native engine. A file Vite loads keeps Vite's
 * `import.meta` untouched; a file Node loads compiled to CommonJS (here through
 * jest.requireActual) gets the CommonJS value of `url`, `filename` and `dirname`, and
 * fails by name on anything else (IMPORT_META_IN_NODE_OWNED). Unit tests:
 * tests/import-meta-node-compile.test.ts.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import * as viteOwned from "./fixtures/import-meta/vite-owned";

declare const jest: { requireActual: (m: string) => Record<string, unknown> };

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/import-meta");

it("leaves a file Vite loads to Vite", () => {
  // The mode of this run: "test" by default, the --mode a suite passes otherwise.
  expect(viteOwned.mode).toBe(import.meta.env.MODE);
  expect(viteOwned.url).toBe(pathToFileURL(path.join(fixtures, "vite-owned.ts")).href);
});

it("gives a file Node loads the CommonJS values", () => {
  const file = path.join(fixtures, "node-lowered.ts");
  expect(jest.requireActual("./fixtures/import-meta/node-lowered.ts")).toMatchObject({
    url: pathToFileURL(file).href,
    filename: file,
    dirname: fixtures,
  });
});

it("fails by name on a property only Vite has", () => {
  expect(() => jest.requireActual("./fixtures/import-meta/node-env.ts")).toThrow(
    /`import\.meta\.env` in .*node-env\.ts:2:\d+ has no value here/,
  );
});
