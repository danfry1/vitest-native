import { it, expect } from "vitest";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);

// Order-independent: each file asserts the singleton is clean, then dirties it, so
// whichever runs second fails if the previous file's state survived.
//
// Reached through `require` deliberately. A hot worker keeps Node's module caches
// alive across files, and the per-file reset can only clear the CommonJS one —
// Node's ESM registry has no invalidation API, so a package a test file `import`s
// stays resident whatever we do. Packages the engine inlines are unaffected either
// way: they live in Vitest's own graph, which is reset per file.
it("sees a fresh resident singleton and then dirties it", () => {
  const singleton = req("resident-singleton");
  expect(singleton.count()).toBe(0);
  singleton.record("a");
  expect(singleton.count()).toBe(1);
});
