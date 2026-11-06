import { createRequire } from "node:module";
import { expect, test } from "vitest";

// Under isolate: false the entry d1 loaded is still loaded, so the package's support stays
// active for this file, though it registered nothing.
test("keeps the package's support active while its entry is loaded (file 2)", () => {
  expect(createRequire(import.meta.url)("vn-lib-esm-support/lib/later.cjs").hasJest).toBe(true);
});
