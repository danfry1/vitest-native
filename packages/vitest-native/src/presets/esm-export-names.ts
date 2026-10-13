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
