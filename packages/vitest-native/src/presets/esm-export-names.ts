import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";

// The named exports of an installed package's ESM build, read from its source: the
// `export` declarations of the entry and of every module it re-exports with
// `export *`. A preset whose package changes its API between majors uses this for
// its named exports, so they are the installed version's rather than a list that
// holds for one version.
//
// It reads the source and runs nothing, because the package may not load in Node
// (a JSI binding throws at import). The parser is Vite's parseAst: this runs while
// the plugin resolves its config, in the process that already loaded Vite.

/** Metro's order for a module path without an extension: platform files first. */
function sourceExtensions(platform: "ios" | "android"): string[] {
  return [`.${platform}.js`, ".native.js", ".js"];
}

function resolveRelative(from: string, request: string, extensions: string[]): string {
  const base = path.resolve(path.dirname(from), request);
  for (const candidate of [
    base,
    ...extensions.map((ext) => base + ext),
    ...extensions.map((ext) => path.join(base, `index${ext}`)),
  ]) {
    if (fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  }
  throw new VitestNativeError("PRESET_UNAVAILABLE", `cannot resolve '${request}' from ${from}`);
}

interface Node {
  type: string;
  [key: string]: any;
}

function bindingNames(pattern: Node, names: Set<string>): void {
  if (pattern.type === "Identifier") names.add(pattern.name);
  else if (pattern.type === "ObjectPattern") {
    for (const p of pattern.properties) bindingNames(p.type === "RestElement" ? p : p.value, names);
  } else if (pattern.type === "ArrayPattern") {
    for (const p of pattern.elements) if (p) bindingNames(p, names);
  } else if (pattern.type === "RestElement") bindingNames(pattern.argument, names);
  else if (pattern.type === "AssignmentPattern") bindingNames(pattern.left, names);
}

function exportedName(node: Node): string {
  return node.type === "Literal" ? String(node.value) : node.name;
}

/**
 * The named exports of the ESM module `entry` on `platform`, following `export *`
 * through relative paths. `default` is left out: `export *` does not re-export it, and a preset's
 * module serves its default separately.
 */
export function esmExportNames(entry: string, platform: "ios" | "android" = "ios"): string[] {
  const extensions = sourceExtensions(platform);
  const { parseAst } = createRequire(import.meta.url)("vite") as {
    parseAst: (code: string) => { body: Node[] };
  };
  const names = new Set<string>();
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const node of parseAst(fs.readFileSync(file, "utf8")).body) {
      if (node.type === "ExportAllDeclaration") {
        if (node.exported) names.add(exportedName(node.exported));
        else if (String(node.source.value).startsWith(".")) {
          visit(resolveRelative(file, node.source.value, extensions));
        } else {
          throw new VitestNativeError(
            "PRESET_UNAVAILABLE",
            `${file} re-exports a package ('${node.source.value}')`,
          );
        }
      } else if (node.type === "ExportNamedDeclaration") {
        for (const spec of node.specifiers) names.add(exportedName(spec.exported));
        const decl = node.declaration;
        if (decl?.type === "VariableDeclaration") {
          for (const d of decl.declarations) bindingNames(d.id, names);
        } else if (decl?.id) names.add(decl.id.name);
      }
    }
  };
  visit(entry);
  names.delete("default");
  return [...names].sort();
}

/** A package's real export names, from its ESM entry (`module`, else `react-native`). */
function packageExportNames(pkg: string, fromDir: string): string[] {
  const manifestPath = createRequire(path.join(fromDir, "package.json")).resolve(
    `${pkg}/package.json`,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = manifest.module ?? manifest["react-native"];
  if (!entry) {
    throw new VitestNativeError("PRESET_UNAVAILABLE", `${pkg} declares no ESM entry`);
  }
  return esmExportNames(path.join(path.dirname(manifestPath), entry));
}

/**
 * The names a library's test mock module provides, read without running it: its ESM
 * named exports, and the keys of the object it assigns to `module.exports` or exports
 * as default (following a variable to its object literal). A spread of
 * `jest.requireActual(pkg)` or `require(pkg)` brings in that package's real export
 * names. Mocks are written for Babel's module interop, so one file can mix `import`
 * with `module.exports =` (reanimated's lib/module/mock.js).
 */
export function mockModuleExportNames(file: string): string[] {
  const { parseAst } = createRequire(import.meta.url)("vite") as {
    parseAst: (code: string) => { body: Node[] };
  };
  const body = parseAst(fs.readFileSync(file, "utf8")).body as any[];
  const names = new Set<string>();
  // A variable's initializer, so `const mock = {...}; module.exports = mock` reads.
  const resolveBinding = (node: any): any => {
    if (node?.type !== "Identifier") return node;
    for (const stmt of body) {
      if (stmt.type !== "VariableDeclaration") continue;
      for (const d of stmt.declarations) {
        if (d.id.type === "Identifier" && d.id.name === node.name) return resolveBinding(d.init);
      }
    }
    return undefined;
  };
  const requiredPackage = (node: any): string | undefined => {
    const callee = node?.type === "CallExpression" ? node.callee : undefined;
    const isRequire =
      (callee?.type === "Identifier" && callee.name === "require") ||
      (callee?.type === "MemberExpression" && callee.property?.name === "requireActual");
    return isRequire ? node.arguments[0]?.value : undefined;
  };
  const objectFor = (node: any): any => {
    const value = resolveBinding(node);
    return value?.type === "ObjectExpression" ? value : undefined;
  };
  const addObject = (object: any) => {
    for (const prop of object?.properties ?? []) {
      if (prop.type === "SpreadElement") {
        const pkg = requiredPackage(resolveBinding(prop.argument));
        if (pkg) for (const n of packageExportNames(pkg, path.dirname(file))) names.add(n);
        else addObject(objectFor(prop.argument));
      } else if (prop.key) {
        names.add(prop.key.type === "Identifier" ? prop.key.name : String(prop.key.value));
      }
    }
  };
  for (const stmt of body) {
    if (stmt.type === "ExportDefaultDeclaration") addObject(objectFor(stmt.declaration));
    const expr = stmt.type === "ExpressionStatement" ? stmt.expression : undefined;
    if (
      expr?.type === "AssignmentExpression" &&
      expr.left.type === "MemberExpression" &&
      expr.left.object?.name === "module" &&
      expr.left.property?.name === "exports"
    ) {
      addObject(objectFor(expr.right));
    }
  }
  for (const n of esmExportNames(file)) names.add(n);
  names.delete("default");
  names.delete("__esModule");
  return [...names].sort();
}
