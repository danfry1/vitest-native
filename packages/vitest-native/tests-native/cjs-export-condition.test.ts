/**
 * A dependency whose `react-native` export condition points at a CommonJS build does
 * NOT make the importing test file CommonJS.
 *
 * This pins a non-cause, because it is a convincing one. When a test file's own
 * `import { describe } from 'vitest'` is loaded through `require()` and throws
 * "Vitest cannot be imported in a CommonJS module using require()", the obvious
 * suspect is the `react-native` condition: the engine resolves it, plenty of
 * dependencies point it at a CommonJS entry, and the CommonJS-ness looks like it
 * spread through the importing graph. The remedy that suggests itself is dropping
 * `react-native` from the ssr resolve conditions.
 *
 * It is not the cause — the real one is in ecosystem-self-detection.test.ts, and that
 * failure reproduces with no such dependency present at all. Dropping the condition
 * would silently load the WEB build of React Native packages instead of their native
 * one: the wrong code under test, with nothing to indicate it (see
 * export-conditions.test.ts). So both behaviours are asserted together here — the
 * condition still selects the CommonJS build, and this file, which imports it, is
 * still an ES module.
 *
 * A CommonJS build behind that condition is how much of the ecosystem publishes,
 * because Metro consumes CommonJS. Note that such a package usually lists
 * `react-native` AFTER `import` in its export map, and conditions are matched in key
 * order, so the condition frequently does not even apply to an ESM import. The
 * fixture puts it first, which is the stronger case.
 */
import { create, entry } from "rn-condition-cjs-lib";
import { describe, expect, it } from "vitest";

describe("a CommonJS build behind the react-native condition", () => {
  it("is the build that gets loaded", () => {
    expect(entry).toBe("cjs");
    expect(create(() => ({ n: 1 })).getState().n).toBe(1);
  });

  it("leaves the importing test file an ES module", () => {
    // Both halves of the reported symptom: the explicit `import ... from 'vitest'`
    // above resolved (reaching this body at all), and this file was not compiled to
    // CommonJS on the way in.
    expect(import.meta.url).toContain("cjs-export-condition");
  });
});
