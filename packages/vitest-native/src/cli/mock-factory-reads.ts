/**
 * `jest.mock()` factories that read a module-level binding while they run.
 *
 * Mock factories run before the module body: babel-jest hoists `jest.mock` above the
 * imports, and Vitest hoists `vi.mock` the same way. A factory that reads a `const`, `let`
 * or `class` from the module body therefore runs before that binding is initialised.
 * Under Vitest that throws ("Cannot access 'X' before initialization"). Under Jest it
 * often passed only because React Native's Babel preset compiles `const` to `var`, so the
 * factory read `undefined`. Reads inside a function the factory returns happen later, after
 * initialisation, and are not reported. Parsed with the project's own @babel/parser; without
 * it nothing is claimed.
 */
import fs from "node:fs";
import path from "node:path";
import { babelParser } from "../native/plain-javascript.js";

export interface FactoryRead {
  /** Root-relative, POSIX separators. */
  file: string;
  line: number;
  module: string;
  names: string[];
}

const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$)|(?:(?:^|\/)__tests__\/.+\.[cm]?[jt]sx?$)/;
const SKIP_DIRS = new Set(["node_modules", ".git", "ios", "android", "build", "dist", "coverage"]);
const MAX_FILES = 20_000;

type Node = {
  type: string;
  start?: number;
  loc?: { start: { line: number } };
  [key: string]: unknown;
};

const isNode = (v: unknown): v is Node =>
  !!v && typeof v === "object" && typeof (v as Node).type === "string";
const isFunction = (n: Node) =>
  n.type === "ArrowFunctionExpression" ||
  n.type === "FunctionExpression" ||
  n.type === "FunctionDeclaration";
/** Code that runs later, not while the factory runs: functions, methods, instance fields. */
const runsLater = (n: Node) =>
  isFunction(n) ||
  n.type === "ObjectMethod" ||
  n.type === "ClassMethod" ||
  n.type === "ClassPrivateMethod" ||
  ((n.type === "ClassProperty" || n.type === "ClassPrivateProperty") && !n.static);
/** Keys and member names that name rather than read. */
const KEY_PARENTS = new Set([
  "ObjectProperty",
  "Property",
  "ObjectMethod",
  "ClassMethod",
  "ClassProperty",
  "ClassPrivateMethod",
  "ClassPrivateProperty",
]);

/** Names a pattern declares (`a`, `{ a, b: c }`, `[a, ...b]`). */
function patternNames(p: unknown, out: string[] = []): string[] {
  if (!isNode(p)) return out;
  if (p.type === "Identifier") out.push(p.name as string);
  else if (p.type === "ObjectPattern")
    for (const prop of p.properties as Node[])
      patternNames(prop.type === "RestElement" ? prop.argument : prop.value, out);
  else if (p.type === "ArrayPattern") for (const el of p.elements as Node[]) patternNames(el, out);
  else if (p.type === "RestElement") patternNames(p.argument, out);
  else if (p.type === "AssignmentPattern") patternNames(p.left, out);
  return out;
}

/** Identifiers read while `fn` runs: its body, without nested functions, minus its own locals. */
function eagerReads(fn: Node): Set<string> {
  const locals = new Set<string>(
    patternNames({ type: "ArrayPattern", elements: fn.params } as Node),
  );
  const reads = new Set<string>();
  const visit = (n: unknown, parentKey?: string, parent?: Node) => {
    if (Array.isArray(n)) return n.forEach((c) => visit(c, parentKey, parent));
    if (!isNode(n)) return;
    if (n.type.startsWith("TS")) return; // types: nothing runs
    if (n.type === "ClassDeclaration" && isNode(n.id)) locals.add(n.id.name as string);
    if (n.type === "CatchClause") patternNames(n.param).forEach((x) => locals.add(x));
    if (n !== fn && runsLater(n)) {
      // Runs later, if at all; only a computed key runs now.
      if (n.computed) visit(n.key, "key", n);
      return;
    }
    if (n.type === "VariableDeclarator") patternNames(n.id).forEach((x) => locals.add(x));
    if (n.type === "Identifier") {
      const notARead =
        ((parent?.type === "MemberExpression" || parent?.type === "OptionalMemberExpression") &&
          parentKey === "property" &&
          !parent.computed) ||
        (KEY_PARENTS.has(parent?.type ?? "") && parentKey === "key" && !parent?.computed) ||
        (parent?.type === "VariableDeclarator" && parentKey === "id") ||
        (parent?.type === "ClassDeclaration" && parentKey === "id") ||
        (parent?.type === "CatchClause" && parentKey === "param");
      if (!notARead) reads.add(n.name as string);
      return;
    }
    for (const [key, value] of Object.entries(n)) {
      if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
      visit(value, key, n);
    }
  };
  visit(fn.body);
  for (const l of locals) reads.delete(l);
  return reads;
}

export function factoryReadsInFile(
  parse: (c: string, o: Record<string, unknown>) => unknown,
  code: string,
): Omit<FactoryRead, "file">[] {
  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    }) as Node;
  } catch {
    return [];
  }
  const body = ((ast.program as Node).body ?? []) as Node[];
  // Module-level bindings that are not hoisted as values: const, let, class.
  const moduleBindings = new Set<string>();
  for (const s of body) {
    const decl = s.type === "ExportNamedDeclaration" && isNode(s.declaration) ? s.declaration : s;
    if (decl.type === "VariableDeclaration" && decl.kind !== "var") {
      for (const d of decl.declarations as Node[])
        patternNames(d.id).forEach((x) => moduleBindings.add(x));
    } else if (decl.type === "ClassDeclaration" && isNode(decl.id)) {
      moduleBindings.add(decl.id.name as string);
    }
  }
  const found: Omit<FactoryRead, "file">[] = [];
  for (const s of body) {
    if (
      s.type !== "ExpressionStatement" ||
      !isNode(s.expression) ||
      s.expression.type !== "CallExpression"
    )
      continue;
    const call = s.expression;
    const callee = call.callee as Node;
    const isJestMock =
      callee.type === "MemberExpression" &&
      isNode(callee.object) &&
      callee.object.name === "jest" &&
      isNode(callee.property) &&
      callee.property.name === "mock";
    const [specifier, factory] = call.arguments as Node[];
    if (!isJestMock || !isNode(factory) || !isFunction(factory)) continue;
    const names = [...eagerReads(factory)].filter((n) => moduleBindings.has(n)).sort();
    if (names.length) {
      found.push({
        line: s.loc?.start.line ?? 0,
        module: isNode(specifier) && typeof specifier.value === "string" ? specifier.value : "…",
        names,
      });
    }
  }
  return found;
}

/** A file's text, or null when it cannot be read (a broken link, a directory, permissions). */
function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Test files under `root` whose jest.mock factories read module-level bindings. */
export function mockFactoryForwardReads(root: string): FactoryRead[] {
  const parse = babelParser(root);
  if (!parse) return [];
  const out: FactoryRead[] = [];
  let budget = MAX_FILES;
  // An unreadable directory holds no test file migrate could read either.
  const list = (dir: string): fs.Dirent[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  const walk = (dir: string) => {
    for (const e of list(dir).sort((a, b) => a.name.localeCompare(b.name))) {
      if (budget <= 0) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(full);
        continue;
      }
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (!TEST_FILE.test(rel)) continue;
      budget--;
      const code = readText(full);
      if (code === null || !code.includes("jest.mock(")) continue;
      for (const f of factoryReadsInFile(parse, code)) out.push({ file: rel, ...f });
    }
  };
  walk(root);
  return out;
}
