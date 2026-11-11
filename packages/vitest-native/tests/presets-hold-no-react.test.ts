import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUNTIME_RESIDENT_PACKAGES } from "../src/native/ownership.mjs";

// vitest-native's presets load once per worker and stay resident under the hot runtime,
// while hotRuntime.freshRuntime evaluates React (RUNTIME_RESIDENT_PACKAGES) again for each
// file. A preset module that imports React as a value at module scope, directly or through
// vitest-native's own modules it imports (mocks/host.ts, say), keeps the first file's copy
// (#719): a factory takes the file's React from its context instead. The lint rule
// preset-react-per-file reports a direct import; this follows the indirect ones, from the
// presets index and from every preset module it names.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const parse = (
  createRequire(createRequire(import.meta.url).resolve("@babel/core"))("@babel/parser") as {
    parse: (code: string, options: Record<string, unknown>) => { program: { body: any[] } };
  }
).parse;

/** The module specifiers a file imports or re-exports as values, at module scope. */
function valueImports(file: string): string[] {
  const { body } = parse(fs.readFileSync(file, "utf8"), {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  }).program;
  const specifiers: string[] = [];
  for (const node of body) {
    if (node.type === "ImportDeclaration") {
      if (node.importKind === "type") continue;
      const values = node.specifiers.filter((s: any) => s.importKind !== "type");
      // A side-effect import has no specifiers, and evaluates the module.
      if (node.specifiers.length > 0 && values.length === 0) continue;
      specifiers.push(node.source.value);
    } else if (
      (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") &&
      node.source &&
      node.exportKind !== "type"
    ) {
      specifiers.push(node.source.value);
    }
  }
  return specifiers;
}

/** A relative specifier as the source file it names (`./x.js` is `./x.ts` in source). */
function sourceFile(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier);
  const stem = base.replace(/\.(m?js|ts|mts)$/, "");
  for (const candidate of [base, `${stem}.ts`, `${stem}.mts`, `${stem}.mjs`, `${stem}.js`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`${path.relative(src, from)}: cannot find ${specifier}`);
}

const isResidentPackage = (specifier: string) =>
  RUNTIME_RESIDENT_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));

const captures = new Map<string, boolean>();
/** Whether evaluating `file` imports a package freshRuntime evaluates per file. */
function capturesReact(file: string): boolean {
  const known = captures.get(file);
  if (known !== undefined) return known;
  captures.set(file, false); // An import cycle adds nothing the rest of the walk misses.
  const result = valueImports(file).some((specifier) =>
    specifier.startsWith(".")
      ? capturesReact(sourceFile(file, specifier))
      : isResidentPackage(specifier),
  );
  captures.set(file, result);
  return result;
}

/** Each preset's name, from the presets index, and the file that defines it. */
function presetFiles(): Map<string, string> {
  const index = path.join(src, "presets/index.ts");
  const files = new Map<string, string>();
  for (const node of parse(fs.readFileSync(index, "utf8"), {
    sourceType: "module",
    plugins: ["typescript"],
  }).program.body) {
    if (node.type !== "ExportNamedDeclaration" || !node.source) continue;
    for (const specifier of node.specifiers) {
      files.set(specifier.exported.name, sourceFile(index, node.source.value));
    }
  }
  return files;
}

describe("vitest-native's presets", () => {
  it("import no React at module scope, directly or through their own modules", () => {
    const presets = presetFiles();
    expect(presets.size, "presets read from presets/index.ts").toBeGreaterThan(10);
    const files = [path.join(src, "presets/index.ts"), ...presets.values()];
    const holding = files
      .filter((file) => capturesReact(file))
      .map((file) => path.relative(src, file));
    expect(holding).toEqual([]);
  });
});
