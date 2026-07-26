/**
 * The remediation advice must work, not merely be printed.
 *
 * When Node cannot parse an untranspiled node_modules file, the native engine
 * replaces the bare "Unexpected token '<'" with an explanation naming the package
 * and the fix:
 *
 *     reactNative({ transform: ['<pkg>'] })
 *
 * That is the answer to the most common migration blocker in the ecosystem, and
 * it was only ever checked as a SUBSTRING of the error message
 * (explain-untransformed.test.ts). Nothing applied it. Advice that stops working
 * would keep being printed, and every suite would stay green while users followed
 * instructions that no longer fix anything.
 *
 * This file is that same fixture with the advice applied — the config differs from
 * the main native config by exactly the one option the message tells users to add.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("the transform:[...] advice the explainer prints", () => {
  it("makes the package the error named actually load", () => {
    // Untransformed, this require throws SyntaxError: Unexpected token '<'.
    const Badge = require("untranspiled-jsx-lib");
    expect(typeof Badge).toBe("function");
  });

  it("compiles its JSX rather than merely resolving the module", () => {
    // Resolving proves nothing on its own: the failure is at parse time, so the
    // test has to reach the JSX. Calling it returns the element the source
    // describes, which can only happen if the JSX was compiled.
    const Badge = require("untranspiled-jsx-lib") as () => { type: string };
    expect(Badge().type).toBe("text");
  });
});
