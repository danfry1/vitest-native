import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every error code the package throws has an entry on the error-code page, and the page
// lists no code the package no longer throws. The page is where a code's causes and fix
// are written down; an error raised with a code it does not list sends the reader
// nowhere, and a stale entry describes an error nobody can see.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(packageRoot, "src");
const PAGE = path.resolve(packageRoot, "../../website/guide/errors.md");

// A constructor whose code is not a string literal cannot be read here. Each one is
// listed with the codes it can carry, which must be thrown literally elsewhere too.
const NON_LITERAL: Record<string, string[]> = {
  // transformFailure() re-raises the error Babel's thread sent, keeping its code.
  "native/transform.mjs": ["IMPORT_META_IN_NODE_OWNED"],
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:[cm]?js|m?ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [file] : [];
  });
}

function thrownCodes() {
  const codes = new Set<string>();
  const nonLiteral = new Set<string>();
  for (const file of sourceFiles(srcRoot)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, code] of text.matchAll(
      /VitestNative(?:Type)?Error\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]/g,
    )) {
      codes.add(code);
    }
    if (/new VitestNative(?:Type)?Error\(\s*[^"'`\s]/.test(text)) {
      nonLiteral.add(path.relative(srcRoot, file).split(path.sep).join("/"));
    }
  }
  return { codes, nonLiteral };
}

function documentedCodes(): string[] {
  const page = fs.readFileSync(PAGE, "utf8");
  return [...page.matchAll(/^### `([A-Z][A-Z0-9_]*)` \{#([A-Za-z0-9_]+)\}$/gm)].map(
    ([, code, anchor]) => {
      // The anchor is the code itself, so a link can be built from error.code alone.
      expect(anchor, code).toBe(code);
      return code;
    },
  );
}

describe("website/guide/errors.md", () => {
  const { codes, nonLiteral } = thrownCodes();

  it("finds the codes the package throws", () => {
    // A scan that matched nothing would make the comparison below vacuous.
    expect(codes.size).toBeGreaterThan(20);
  });

  it("has one entry, anchored by the code, for each code the package throws", () => {
    const documented = documentedCodes();
    expect(documented.length, "duplicate entries").toBe(new Set(documented).size);
    expect([...documented].sort()).toEqual([...codes].sort());
  });

  it("knows every constructor whose code is not a literal", () => {
    expect([...nonLiteral].sort()).toEqual(Object.keys(NON_LITERAL).sort());
    for (const carried of Object.values(NON_LITERAL).flat()) expect(codes).toContain(carried);
  });
});
