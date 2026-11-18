/**
 * The name jestMockTransform's rewritten calls reach Vitest's `vi` by, and the import it
 * adds for it (#818). Run end to end, under `globals: false`, by
 * jest-mock-transform-globals.e2e.test.ts.
 */
import { describe, expect, it } from "vitest";
import { jestMockTransform } from "../src/jest-compat/index.js";

const { parseAst } = require("vite");

function run(code: string): { code: string } | null {
  const t = jestMockTransform().transform as (this: any, c: string, i: string) => any;
  return t.call(
    { parse: (c: string) => parseAst(c), resolve: async () => null },
    code,
    "/p/a.test.ts",
  );
}

const MOCK = "jest.mock('./api', () => ({ a: 1 }));";
const IMPORT_VI = '\nimport { vi } from "vitest";\n';
const IMPORT_VITEST = '\nimport { vitest } from "vitest";\n';

describe("jestMockTransform: binding Vitest's vi (#818)", () => {
  it("imports vi, after the file's last line, when the file does not", () => {
    for (const head of [
      "",
      "import { expect, test } from 'vitest';",
      "import { vi as v } from 'vitest';",
      "import * as vitestNs from 'vitest';",
    ]) {
      const source = `${head}\n${MOCK}\n// last line`;
      const out = run(source)!.code;
      expect(out.endsWith(`// last line${IMPORT_VI}`), head).toBe(true);
      expect(out).toMatch(/^vi\.mock\('\.\/api'/m);
    }
  });

  it("adds nothing when the file imports vi (or vitest as vi) from 'vitest'", () => {
    for (const head of [
      "import { vi } from 'vitest';",
      "import { vitest as vi, test } from 'vitest';",
    ]) {
      const out = run(`${head}\n${MOCK}`)!.code;
      expect(out).not.toMatch(/\nimport \{ vi(?:test)? \} from "vitest";\n$/);
      expect(out).toMatch(/^vi\.mock\('\.\/api'/m);
    }
  });

  it("calls vitest, and imports it, when the file declares vi as something else at the top", () => {
    for (const declaration of [
      "const vi = { mine: true };",
      "import { vi } from './not-vitest';",
      "const { vi } = require('x');",
      "class vi {}",
      "function vi() {}",
      "if (true) { var vi = 1; }",
      // Vitest's own object, but initialised only after Vitest hoists vi.mock above it.
      "import * as ns from 'vitest';\nconst { vi } = ns;",
    ]) {
      const out = run(`${declaration}\n${MOCK}\njest.doMock('./b', () => ({}));`)!.code;
      expect(out.endsWith(IMPORT_VITEST), declaration).toBe(true);
      expect(out).toMatch(/^vitest\.mock\('\.\/api'/m);
      expect(out).toMatch(/vitest\.doMock\('\.\/b'/);
      // Every call the transform writes, its setup accessor's included, goes through vitest.
      expect(out).toMatch(/^const __vn_jest_compat__ = vitest\.hoisted\(/);
      expect(out).toMatch(/^vitest\.hoisted\(\(\) => globalThis\.__vnJestMock/m);
      expect(out).not.toMatch(/\bvi\.(?:mock|doMock|hoisted|importActual|mockObject)\(/);
    }
  });

  it("calls vitest when a scope around a call declares vi", () => {
    for (const helper of [
      "function helper(vi) { jest.doMock('./b', () => ({})); }",
      "try {} catch (vi) { jest.doMock('./b', () => ({})); }",
      "{ const vi = 1; jest.doMock('./b', () => ({})); }",
    ]) {
      const out = run(`${MOCK}\n${helper}`)!.code;
      expect(out.endsWith(IMPORT_VITEST), helper).toBe(true);
      expect(out).toMatch(/vitest\.doMock\('\.\/b'/);
    }
  });

  it("keeps vi when only a scope no call is in declares it", () => {
    for (const elsewhere of [
      "[1].map((vi) => vi);",
      "function f() { const vi = 1; const vitest = 2; return vi + vitest; }",
      "try {} catch (vi) {}",
      "class C { m(vi) { return vi; } }",
    ]) {
      const out = run(`${elsewhere}\n${MOCK}`)!.code;
      expect(out.endsWith(IMPORT_VI), elsewhere).toBe(true);
      expect(out).toMatch(/^vi\.mock\('\.\/api'/m);
    }
    // A nested vitest does not take the name from a top-level call either.
    const out = run(
      `const vi = 1;\nfunction f() { const vitest = 2; return vitest; }\n${MOCK}`,
    )!.code;
    expect(out).toMatch(/^vitest\.mock\('\.\/api'/m);
    expect(out.endsWith(IMPORT_VITEST)).toBe(true);
  });

  it("uses an imported vitest when vi is taken", () => {
    const out = run(`import { vitest } from 'vitest';\nconst vi = 1;\n${MOCK}`)!.code;
    expect(out).toMatch(/^vitest\.mock\('\.\/api'/m);
    expect(out).not.toContain(IMPORT_VITEST);
  });

  it("fails by name when both names are bound to something else where a call runs", () => {
    for (const source of [
      `const vi = 1;\nconst vitest = 2;\n${MOCK}`,
      // A namespace import is not the vi object, and the destructured vi is not yet
      // initialised where Vitest hoists vi.mock: plain Vitest fails on this file too.
      `import * as vitest from 'vitest';\nconst { vi, expect } = vitest;\n${MOCK}`,
      // vi at the top, vitest around the call.
      `const vi = 1;\nfunction f(vitest) { jest.doMock('./b', () => ({})); }`,
    ]) {
      let thrown: any;
      try {
        run(source);
      } catch (error) {
        thrown = error;
      }
      expect(thrown?.code, source).toBe("JEST_MOCK_VI_UNAVAILABLE");
      expect(thrown?.message).toContain("/p/a.test.ts");
      expect(thrown?.message).toContain("binds both names to something other than that import");
    }
  });

  it("leaves a file with no hoistable jest call alone, whatever it names vi", () => {
    // It names jest and `mock`, so it is parsed, but it has no call to rewrite.
    expect(run("const vi = 1;\nconst vitest = 2;\nconst mock = jest.fn();")).toBeNull();
  });
});
