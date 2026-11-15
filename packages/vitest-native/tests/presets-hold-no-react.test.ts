import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isPerFilePackage } from "../lint/per-file-packages.mjs";

// vitest-native's presets load once per worker and stay resident under the hot runtime,
// while hotRuntime.freshRuntime evaluates React again for each file (the packages in
// lint/per-file-packages.mjs, the lint rule's list). A preset module that takes React once per worker, directly or through
// vitest-native's own modules it loads (mocks/host.ts, say), keeps the first file's copy
// (#719): a factory takes the file's React from its context instead. The lint rule
// preset-react-per-file reports a preset's own; this follows the indirect ones, from the
// presets index and from every preset module it names, through static imports,
// `import()` and `require()`.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const babel = createRequire(createRequire(import.meta.url).resolve("@babel/core"));
const parse = (
  babel("@babel/parser") as {
    parse: (code: string, options: Record<string, unknown>) => any;
  }
).parse;
const traverse = (babel("@babel/traverse") as { default: (ast: any, visitors: any) => void })
  .default;

// `anchored`: loaded through a `createRequire` anchored elsewhere, whose relative
// specifiers name another package's files, not vitest-native's.
type Load = { specifier: string; oncePerWorker: boolean; anchored?: boolean };

/** Whether `fnPath` runs once per worker: called where it is defined at module scope, or
 * a named function called at module scope, directly or through another such function. */
function runsAtLoad(fnPath: any, seen = new Set<any>()): boolean {
  if (seen.has(fnPath.node)) return false;
  seen.add(fnPath.node);
  const callers: any[] = [];
  if (fnPath.parentPath.isCallExpression() && fnPath.parentPath.node.callee === fnPath.node) {
    callers.push(fnPath.parentPath);
  } else {
    const id = fnPath.node.id ?? (fnPath.parentPath.isVariableDeclarator() && fnPath.parent.id);
    const binding = id?.type === "Identifier" ? fnPath.scope.parent?.getBinding(id.name) : null;
    for (const ref of binding?.referencePaths ?? []) {
      if (ref.parentPath.isCallExpression() && ref.parentPath.node.callee === ref.node) {
        callers.push(ref.parentPath);
      }
    }
  }
  return callers.some((call) => {
    const outer = call.getFunctionParent();
    return outer === null || runsAtLoad(outer, seen);
  });
}

/** Whether a require at `callPath` runs once per worker: in code that runs at load
 * (runsAtLoad), or with its result kept in a module-scope binding, by assignment or
 * through a method of one (`cache.set(key, require("react"))`). */
function oncePerWorker(callPath: any): boolean {
  const fn = callPath.getFunctionParent();
  if (fn === null || runsAtLoad(fn)) return true;
  const moduleScoped = (node: any) => {
    while (node?.type === "MemberExpression") node = node.object;
    return (
      node?.type === "Identifier" && callPath.scope.getBinding(node.name)?.scope.path.isProgram()
    );
  };
  for (let at = callPath.parentPath; at && at !== fn; at = at.parentPath) {
    if (at.isAssignmentExpression() && moduleScoped(at.node.left)) return true;
    if (
      at.isCallExpression() &&
      at.node.callee.type === "MemberExpression" &&
      moduleScoped(at.node.callee) &&
      !callPath.findParent((p: any) => p.node === at.node.callee)
    ) {
      return true;
    }
  }
  return false;
}

/** The modules a file loads: static value imports and re-exports, `import()`, and
 * `require()` (also `module.require` and a `createRequire` function), with whether each
 * runs once per worker. A dynamic import is cached for the worker wherever it runs. */
function loads(file: string): Load[] {
  const ast = parse(fs.readFileSync(file, "utf8"), {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const found: Load[] = [];
  const literal = (node: any): string | null =>
    node?.type === "StringLiteral"
      ? node.value
      : node?.type === "TemplateLiteral" && node.expressions.length === 0
        ? node.quasis[0].value.cooked
        : null;
  // A call of node:module's createRequire, under whatever local name it was imported.
  const isCreateRequire = (node: any, scope: any) => {
    if (node?.type !== "CallExpression" || node.callee.type !== "Identifier") return false;
    const binding = scope.getBinding(node.callee.name);
    if (!binding) return node.callee.name === "createRequire";
    return (
      binding.path.isImportSpecifier() &&
      binding.path.node.imported.name === "createRequire" &&
      /^(?:node:)?module$/.test(binding.path.parent.source.value)
    );
  };
  traverse(ast, {
    ImportDeclaration({ node }: any) {
      if (node.importKind === "type") return;
      const values = node.specifiers.filter((s: any) => s.importKind !== "type");
      // A side-effect import has no specifiers, and evaluates the module.
      if (node.specifiers.length > 0 && values.length === 0) return;
      found.push({ specifier: node.source.value, oncePerWorker: true });
    },
    "ExportNamedDeclaration|ExportAllDeclaration"({ node }: any) {
      if (node.source && node.exportKind !== "type") {
        found.push({ specifier: node.source.value, oncePerWorker: true });
      }
    },
    Import(importPath: any) {
      const specifier = literal(importPath.parentPath.node.arguments[0]);
      if (specifier !== null) found.push({ specifier, oncePerWorker: true });
    },
    CallExpression(callPath: any) {
      const { callee, arguments: args } = callPath.node;
      const plain =
        (callee.type === "Identifier" && callee.name === "require") ||
        (callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "module" &&
          callee.property.name === "require");
      const bound = callee.type === "Identifier" ? callPath.scope.getBinding(callee.name) : null;
      const anchored =
        (bound != null && isCreateRequire(bound.path.node.init, bound.path.scope)) ||
        isCreateRequire(callee, callPath.scope);
      const specifier = plain || anchored ? literal(args[0]) : null;
      if (specifier !== null) {
        found.push({ specifier, oncePerWorker: oncePerWorker(callPath), anchored });
      }
    },
  });
  return found;
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

const captures = new Map<string, boolean>();
/** Whether evaluating `file` imports a package freshRuntime evaluates per file. */
function capturesReact(file: string): boolean {
  const known = captures.get(file);
  if (known !== undefined) return known;
  captures.set(file, false); // An import cycle adds nothing the rest of the walk misses.
  // A module of vitest-native's own is resident wherever it is loaded from, so its
  // module scope counts even when a function loads it. A package counts only when it is
  // loaded once per worker; a require in a function that returns it is per call.
  const result = loads(file).some(({ specifier, oncePerWorker: once, anchored }) => {
    if (specifier.startsWith(".")) return !anchored && capturesReact(sourceFile(file, specifier));
    if (specifier.startsWith("#") || specifier.startsWith("vitest-native")) {
      throw new Error(`${path.relative(src, file)}: follow ${specifier} to its source file`);
    }
    return once && isPerFilePackage(specifier);
  });
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
