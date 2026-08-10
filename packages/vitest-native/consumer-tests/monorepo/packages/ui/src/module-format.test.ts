/**
 * The same defect observed directly, rather than through the error it happens to
 * cause first.
 *
 * `import { it } from 'vitest'` throwing is a consequence: the real fault is that a
 * test file inside a detected workspace package was executed as CommonJS at all. A
 * CommonJS copy of this file has no `import.meta`, so this is the property that
 * actually flipped — and it holds whichever layout the harness is running, and
 * whether or not the suite happens to import from 'vitest' explicitly.
 *
 * Kept apart from own-tests.test.ts on purpose: `import.meta` is a compile-time error
 * under CommonJS, so having both observations in one file would mask the reported
 * symptom behind a SyntaxError.
 */
import { describe, expect, it } from "vitest";

describe("test entries in a workspace library", () => {
  it("are executed as modules, not compiled to CommonJS", () => {
    expect(import.meta.url).toContain("module-format.test");
  });
});
