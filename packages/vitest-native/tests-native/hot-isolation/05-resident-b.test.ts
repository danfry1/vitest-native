import { it, expect } from "vitest";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

// Order-independent: each file asserts the singleton is clean, then dirties it, so
// whichever runs second fails if the previous file's state survived.
//
// Reached through `require` deliberately, to cover the CommonJS cache specifically.
// The ESM path is covered by its twin in 08/09 — it used to be the hole this pair
// was written around, and is now closed by the loader's per-file generation stamp.
// Vite-owned app packages are unaffected either way: Vitest resets that graph per
// file. This fixture is deliberately Node-owned, so it exercises the other cache.
it("sees a fresh resident singleton and then dirties it", () => {
  const singleton = req("resident-singleton");
  expect(singleton.count()).toBe(0);
  singleton.record("b");
  expect(singleton.count()).toBe(1);
});
