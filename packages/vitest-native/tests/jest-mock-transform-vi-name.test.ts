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

  it("calls vitest, and imports it, when the file declares vi as something else", () => {
    for (const declaration of [
      "const vi = { mine: true };",
      "import { vi } from './not-vitest';",
      "function helper(vi) { return vi; }",
      "const { vi } = require('x');",
      "try {} catch (vi) {}",
      "class vi {}",
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

  it("uses an imported vitest when vi is taken", () => {
    const out = run(`import { vitest } from 'vitest';\nconst vi = 1;\n${MOCK}`)!.code;
    expect(out).toMatch(/^vitest\.mock\('\.\/api'/m);
    expect(out).not.toContain(IMPORT_VITEST);
  });

  it("fails by name when the file declares both vi and vitest as something else", () => {
    let thrown: any;
    try {
      run(`const vi = 1;\nconst vitest = 2;\n${MOCK}`);
    } catch (error) {
      thrown = error;
    }
    expect(thrown?.code).toBe("JEST_MOCK_VI_UNAVAILABLE");
    expect(thrown?.message).toContain("/p/a.test.ts");
  });

  it("leaves a file with no hoistable jest call alone, whatever it names vi", () => {
    // It names jest and `mock`, so it is parsed, but it has no call to rewrite.
    expect(run("const vi = 1;\nconst vitest = 2;\nconst mock = jest.fn();")).toBeNull();
  });
});
