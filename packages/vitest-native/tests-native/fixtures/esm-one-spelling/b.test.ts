// One of two files in one hot worker: an ES package, imported and required.
import { createRequire } from "node:module";
import * as viaImport from "vn-esm-one-spelling";

const viaRequire = createRequire(import.meta.url)("vn-esm-one-spelling");
const seen = ((process as unknown as { __oneSpelling?: object[] }).__oneSpelling ??= []);

function stackOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return String((error as Error).stack);
  }
  return "";
}

test("an import and a require of it are one instance, and each file its own", () => {
  expect(viaRequire.made, "the require and the import are one instance").toBe(viaImport.made);
  for (const earlier of seen) {
    expect(viaImport.made, "a new instance in each file").not.toBe(earlier);
  }
  seen.push(viaImport.made);
});

test("it names its real file in import.meta", () => {
  expect(viaImport.meta.url, "import.meta.url names the file").toMatch(/\/vn-esm-one-spelling\/index\.js$/);
  expect(viaImport.meta.filename, "import.meta.filename names the file").toMatch(/[\\/]vn-esm-one-spelling[\\/]index\.js$/);
  expect(viaImport.meta.dirname, "import.meta.dirname names the file").toMatch(/[\\/]vn-esm-one-spelling$/);
  // error.stack read here is Vite's module runner's, which names the generation's file
  // (docs: hot-runtime, known differences); a reported error names the real one
  // (reported.check.ts).
  expect(stackOf(() => viaRequire.boom())).toMatch(/vn-esm-one-spelling[\\/]index/);
});
