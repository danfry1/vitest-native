// ADR-0004's dual-export-file: the test imports a package whose `exports` map has separate
// `import` and `require` builds, and the package's own CommonJS code requires it.
import { expect, test } from "vitest";
import { store } from "museum-dual";
import reader from "museum-dual/reader";

test("a package with separate import and require builds is one module", () => {
  store.value = "configured";
  expect(reader().value, "one museum-dual, whichever condition loaded it").toBe("configured");
});
