// End-to-end wiring check for the untransformed-package explainer: requiring a
// node_modules package that ships untranspiled JSX (the single most common
// migration blocker) must surface the explained error — naming the package and
// the `transform: ['<pkg>']` fix — not Node's bare "Unexpected token '<'".
// The pure explainer functions are unit-tested in tests/explain.test.ts; this
// exercises the live require-hook path in native/hooks.mjs.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("untransformed node_modules JSX", () => {
  it("explains the transform:[...] fix instead of a bare SyntaxError", () => {
    let caught: unknown;
    try {
      require("untranspiled-jsx-lib");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SyntaxError);
    const err = caught as SyntaxError & { cause?: unknown };
    expect(err.message).toContain("'untranspiled-jsx-lib' shipped source Node can't run directly");
    expect(err.message).toContain("transform: ['untranspiled-jsx-lib']");
    expect(err.message).toContain("migrating-from-jest.md");
    // The original Node error stays attached for debugging.
    expect(err.cause).toBeInstanceOf(SyntaxError);
  });
});
