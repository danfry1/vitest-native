/**
 * `vitest-native/rntl-matchers` declares RNTL's matcher interface itself, because RNTL
 * keeps it at a different internal path in each major. This keeps the copy honest: its
 * members must match the installed RNTL's `JestNativeMatchers`, parameter lists
 * included. CI runs this suite on the RNTL 12 and 13 legs as well as the locked 14.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/** `name(params)` for each member of `interface <name><R> { ... }` in a .d.ts. */
function members(source: string, name: string): string[] {
  const body = source.match(new RegExp(`interface ${name}<R> \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) throw new Error(`interface ${name} not found`);
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const signatures = withoutComments.match(/\b\w+\([^)]*(?:\{[^}]*\}[^)]*)?\): R;/g) ?? [];
  return signatures.map((s) => s.replace(/\s+/g, " ").replace(/\): R;$/, ")")).sort();
}

/** Each parameter reduced to `_` or `_?`: names differ between majors (`element` in 12
 *  and 13, `instance` in 14) and types are declared under other names here, so the
 *  comparison is of arity and optionality. */
function shapes(signatures: string[]): string[] {
  return signatures.map((s) =>
    s.replace(/\w+(\??): [^,)]+(?:\{[^}]*\})?/g, (_, optional: string) => `_${optional}`),
  );
}

describe("rntl-matchers types", () => {
  const rntlRoot = path.dirname(require.resolve("@testing-library/react-native/package.json"));
  const rntlTypes = ["dist", "build"]
    .map((dir) => path.join(rntlRoot, dir, "matchers/types.d.ts"))
    .find((file) => existsSync(file));
  const ours = readFileSync(new URL("../src/rntl-matchers.d.ts", import.meta.url), "utf8");

  it("finds the installed RNTL's matcher interface", () => {
    expect(rntlTypes).toBeDefined();
  });

  it("declares exactly the installed RNTL's matchers, with the same parameters", () => {
    const theirs = members(readFileSync(rntlTypes!, "utf8"), "JestNativeMatchers");
    expect(theirs.length).toBeGreaterThan(10);
    expect(shapes(members(ours, "RNTLMatchers"))).toEqual(shapes(theirs));
  });
});
