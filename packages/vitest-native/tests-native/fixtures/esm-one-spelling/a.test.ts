// One of two files in one hot worker: an ES package, imported and required.
import { createRequire } from "node:module";
import * as viaImport from "vn-esm-one-spelling";

const viaRequire = createRequire(import.meta.url)("vn-esm-one-spelling");
const seen = ((process as unknown as { __oneSpelling?: object[] }).__oneSpelling ??= []);
const MAPPED = process.execArgv.includes("--enable-source-maps");

function stackOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return String((error as Error).stack);
  }
  return "";
}

test("an import and a require of it are one instance, and each file its own", () => {
  expect(viaRequire.made).toBe(viaImport.made);
  for (const earlier of seen) expect(viaImport.made).not.toBe(earlier);
  seen.push(viaImport.made);
});

test("it names its real file in import.meta and in stack traces", () => {
  expect(viaImport.meta.url).toMatch(/\/vn-esm-one-spelling\/index\.js$/);
  expect(viaImport.meta.filename).toMatch(/[\\/]vn-esm-one-spelling[\\/]index\.js$/);
  expect(viaImport.meta.dirname).toMatch(/[\\/]vn-esm-one-spelling$/);
  const stack = stackOf(() => viaRequire.boom());
  expect(stack).not.toMatch(/vnhot/);
  expect(stack).toMatch(
    MAPPED
      ? /vn-esm-one-spelling[\\/]src[\\/]index\.ts:4:/
      : /vn-esm-one-spelling[\\/]index\.js:4:/,
  );
});
