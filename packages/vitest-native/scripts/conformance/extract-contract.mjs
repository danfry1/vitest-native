// The API contract of an installed package, from its own TypeScript declarations: every
// value export, its kind, and for a function its parameters and what it returns, with the
// members of object types two levels deep (docs/mock-conformance-gate.md in the planning
// repository). The conformance probes check the mocks the engine serves against it.
//
//   node scripts/conformance/extract-contract.mjs <package> [--from <dir>]
//
// prints the contract as JSON. It reads the package's `types` entry with the TypeScript 6
// compiler API (the `typescript-6` dev dependency: TypeScript 7 has no such API).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript-6");

/** Types whose members are the platform's, not the package's: recorded by name only. */
const OPAQUE = new Set([
  "Array",
  "ReadonlyArray",
  "Promise",
  "Map",
  "Set",
  "WeakMap",
  "Date",
  "RegExp",
  "Error",
  "Function",
  "Object",
  "Element",
  "ReactElement",
  "ReactNode",
  "JSX.Element",
  "Component",
  "RefObject",
  "MutableRefObject",
]);

/**
 * A shape: `{ kind }`, where kind is one of number, string, boolean, bigint, symbol,
 * function, array, object, null, undefined, void, never, or unchecked (any, unknown, a type
 * parameter, or a union of different kinds); plus `type` for a named type and `members`
 * for an object type that is not opaque.
 */
function shapeOf(checker, type, depth) {
  const flags = type.flags;
  const F = ts.TypeFlags;
  if (flags & (F.Any | F.Unknown | F.TypeParameter | F.Index | F.IndexedAccess | F.Conditional)) {
    return { kind: "unchecked" };
  }
  if (flags & F.NumberLike) return { kind: "number" };
  if (flags & F.StringLike) return { kind: "string" };
  if (flags & F.BooleanLike) return { kind: "boolean" };
  if (flags & F.BigIntLike) return { kind: "bigint" };
  if (flags & F.ESSymbolLike) return { kind: "symbol" };
  if (flags & F.Void) return { kind: "void" };
  if (flags & F.Undefined) return { kind: "undefined" };
  if (flags & F.Null) return { kind: "null" };
  if (flags & F.Never) return { kind: "never" };
  if (type.isUnion()) {
    // `T | undefined` is the T it may be; any other mix is unchecked.
    const defined = type.types.filter((t) => !(t.flags & (F.Undefined | F.Null | F.Void)));
    const kinds = new Set(defined.map((t) => shapeOf(checker, t, depth).kind));
    if (defined.length === 1) return { ...shapeOf(checker, defined[0], depth), optional: true };
    if (kinds.size === 1)
      return { kind: [...kinds][0], optional: defined.length < type.types.length };
    return { kind: "unchecked" };
  }
  if (type.getCallSignatures().length > 0) {
    // A callable type with properties of its own (Reanimated's AnimatedRef: callable, with
    // `current` and `observe`) records them; a plain function type has none.
    const shape = { kind: "function" };
    if (depth > 0) {
      const members = membersOf(checker, type, depth);
      if (Object.keys(members).length > 0) shape.members = members;
    }
    return shape;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) return { kind: "array" };
  if (flags & F.Object || type.isIntersection()) {
    const name = checker.typeToString(type).replace(/<.*$/, "");
    const shape = { kind: "object" };
    const symbolName = type.aliasSymbol?.name ?? type.getSymbol()?.name;
    // A named type; a module's namespace has its file path as a name, which says nothing.
    if (symbolName && /^[A-Za-z_$][\w$]*$/.test(symbolName) && !symbolName.startsWith("__")) {
      shape.type = symbolName;
    }
    if (OPAQUE.has(shape.type ?? name) || depth <= 0) return shape;
    const members = membersOf(checker, type, depth);
    if (Object.keys(members).length > 0) shape.members = members;
    return shape;
  }
  return { kind: "unchecked" };
}

/** The declared members of `type`, each with its shape, one level shallower. */
function membersOf(checker, type, depth) {
  const members = {};
  for (const property of checker.getPropertiesOfType(type)) {
    // A well-known symbol (`[Symbol.iterator]`) is not a member a mock spells out.
    if (property.name.startsWith("__@")) continue;
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (!declaration) continue;
    const memberType = checker.getTypeOfSymbolAtLocation(property, declaration);
    const member = shapeOf(checker, memberType, depth - 1);
    if (property.flags & ts.SymbolFlags.Optional) member.optional = true;
    members[property.name] = member;
  }
  return members;
}

/** The kind of a value export: function, class, object or a primitive. */
function exportOf(checker, symbol, declaration) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  if (type.getConstructSignatures().length > 0 && type.getCallSignatures().length === 0) {
    return { kind: "class" };
  }
  const signatures = type.getCallSignatures();
  if (signatures.length > 0) {
    // The last signature: TypeScript's declaration order puts the most general last.
    const signature = signatures[signatures.length - 1];
    const parameters = signature.getParameters().map((parameter) => {
      const at = parameter.valueDeclaration ?? declaration;
      const shape = shapeOf(checker, checker.getTypeOfSymbolAtLocation(parameter, at), 1);
      const optional = !!(
        at &&
        ts.isParameter(at) &&
        (at.questionToken || at.initializer || at.dotDotDotToken)
      );
      return { ...shape, name: parameter.name, ...(optional ? { optional: true } : {}) };
    });
    const contract = {
      kind: "function",
      parameters,
      returns: shapeOf(checker, signature.getReturnType(), 2),
    };
    // Overloads: what each other signature returns, any of which a call may answer with.
    if (signatures.length > 1) {
      contract.alsoReturns = signatures
        .slice(0, -1)
        .map((other) => shapeOf(checker, other.getReturnType(), 2));
    }
    return contract;
  }
  return shapeOf(checker, type, 2);
}

/** Whether `exported` reaches the module only through `export type` (at any re-export hop). */
function isTypeOnlyExport(exported) {
  return (exported.declarations ?? []).some(
    (declaration) =>
      (ts.isExportSpecifier(declaration) &&
        (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly)) ||
      (ts.isExportDeclaration(declaration) && declaration.isTypeOnly),
  );
}

/** The contract of `pkg`, resolved from `fromDir`. */
export function extractContract(pkg, fromDir = process.cwd()) {
  const resolve = createRequire(path.join(fromDir, "package.json")).resolve;
  const manifestPath = resolve(`${pkg}/package.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const typesEntry = manifest.types ?? manifest.typings;
  if (!typesEntry) throw new Error(`${pkg} ${manifest.version} declares no types entry`);
  const entry = path.join(path.dirname(manifestPath), typesEntry);
  const program = ts.createProgram([entry], {
    noEmit: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${pkg}: ${entry} is not a module`);
  const exports = {};
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    // `export type { X }` of a class or enum: a type at runtime too, whatever X is.
    if (isTypeOnlyExport(exported)) continue;
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    // Value exports only: a type or an interface has nothing at runtime to check.
    if (!(symbol.flags & ts.SymbolFlags.Value)) continue;
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) continue;
    exports[exported.name] = exportOf(checker, symbol, declaration);
  }
  return { package: pkg, version: manifest.version, types: typesEntry, exports };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const pkg = process.argv[2];
  const from = process.argv.includes("--from")
    ? process.argv[process.argv.indexOf("--from") + 1]
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  if (!pkg) throw new Error("usage: extract-contract.mjs <package> [--from <dir>]");
  process.stdout.write(`${JSON.stringify(extractContract(pkg, from), null, 2)}\n`);
}
