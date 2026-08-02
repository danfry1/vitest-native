/**
 * An auto-detected CommonJS package must expose ALL of its exports as named imports.
 *
 * Node decides a CommonJS module's named exports with cjs-module-lexer, which reads
 * the source statically and stops at shapes it cannot follow. This is plain Node,
 * reproducible with no plugin involved:
 *
 *     module.exports = { A() {}, b: () => 1 };
 *     import * as m from "./that.cjs";   // ["A", "default", "module.exports"]
 *
 * `b` is missing and a name that is not an export appears. It became reachable when
 * auto-detected packages moved from Vite's graph — whose interop enumerates the real
 * object at run time — into Node's, so `import { b } from 'some-rn-lib'` started
 * failing with "does not provide an export named".
 *
 * Deliberately UNMOCKED. The sibling suite mocks this package, and a `vi.mock`
 * factory supplies the names itself, so the named import resolves from the mock no
 * matter what the module offers — which is exactly why the regression went unseen.
 */
import { describe, expect, it } from "vitest";
import * as lib from "rn-ecosystem-lib";

describe("auto-detected CommonJS package: named-export surface", () => {
  it("carries every runtime export in its namespace", () => {
    // renderCount and platformSeen are the ones the lexer drops: it stops at the
    // first arrow-valued property of the object literal.
    //
    // Asserted on the namespace rather than on `import { renderCount }`, because a
    // destructured import does NOT discriminate here — Vitest's interop resolves
    // the binding off the underlying object even when the module's declared names
    // omit it, so `typeof renderCount === "function"` passes with the defect
    // present. Removing the fix leaves this assertion as the one that fails.
    for (const name of ["Banner", "renderCount", "platformSeen"]) {
      expect(Object.keys(lib)).toContain(name);
    }
  });

  it("those exports are the real implementation, not a stub", () => {
    expect((lib as unknown as { platformSeen: () => string }).platformSeen()).toBe("ios");
  });
});
