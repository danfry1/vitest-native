/**
 * Evidence that a package needs `transform`: a `.js` file under one of its entry
 * points that is not standard JavaScript (JSX or Flow), which neither Node nor Vite
 * loads from a `.js` file. Not evidence: ES-module syntax in `.js` and TypeScript
 * entries — Vitest inlines files that are not valid Node imports, and Vite compiles
 * both. Parsed with the project's @babel/parser and no syntax plugins; without the
 * parser there is no evidence and nothing is claimed.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { installedManifest } from "./manifest.js";

type Parse = (code: string, options: Record<string, unknown>) => unknown;

function babelParser(root: string): Parse | null {
  const req = createRequire(path.join(root, "package.json"));
  for (const from of [() => req, () => createRequire(req.resolve("@babel/core"))]) {
    try {
      return (from()("@babel/parser") as { parse: Parse }).parse;
    } catch {
      // not resolvable this way
    }
  }
  return null;
}

/** Directories in a package that are not part of what it runs. */
const SKIP_DIRS = new Set([
  "node_modules",
  "__tests__",
  "__mocks__",
  "test",
  "tests",
  "example",
  "examples",
  "docs",
]);
const MAX_FILES = 400;

function packageDir(root: string, pkg: string): string | null {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", pkg);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

/** Entry files a resolver may pick: `react-native`, `main`, `module` and `exports` strings. */
function entryFiles(dir: string, manifest: Record<string, unknown>): string[] {
  const targets: string[] = [];
  for (const field of ["react-native", "main", "module"]) {
    if (typeof manifest[field] === "string") targets.push(manifest[field] as string);
  }
  const walk = (node: unknown) => {
    if (typeof node === "string") targets.push(node);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  const exportsField = manifest.exports;
  walk(
    exportsField && typeof exportsField === "object" && "." in exportsField
      ? (exportsField as Record<string, unknown>)["."]
      : exportsField,
  );
  if (targets.length === 0) targets.push("index.js");
  const files = new Set<string>();
  for (const target of targets) {
    const base = path.join(dir, target);
    for (const file of [base, `${base}.js`, path.join(base, "index.js")]) {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        files.add(file);
        break;
      }
    }
  }
  return [...files];
}

/**
 * The first file under `pkg`'s entry points that Node cannot run as published, as a
 * path relative to the package, or null when none was found.
 */
export function untranspiledFile(root: string, pkg: string): string | null {
  const dir = packageDir(root, pkg);
  const manifest = installedManifest(root, pkg);
  if (!dir || !manifest) return null;
  const entries = entryFiles(dir, manifest);
  const parse = babelParser(root);
  if (!parse) return null;
  const seen = new Set<string>();
  const queue = [...new Set(entries.map((e) => path.dirname(e)))];
  let budget = MAX_FILES;
  while (queue.length && budget > 0) {
    const current = queue.shift()!;
    let names: string[];
    try {
      names = fs.readdirSync(current);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      const file = path.join(current, name);
      if (seen.has(file)) continue;
      seen.add(file);
      const stat = fs.statSync(file);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name)) queue.push(file);
        continue;
      }
      if (!/\.(js|cjs|mjs)$/.test(name) || budget-- <= 0) continue;
      try {
        parse(fs.readFileSync(file, "utf8"), {
          sourceType: "unambiguous",
          allowReturnOutsideFunction: true,
          allowAwaitOutsideFunction: true,
        });
      } catch {
        // POSIX separators, so the report reads the same on every platform.
        return path.relative(dir, file).split(path.sep).join("/");
      }
    }
  }
  return null;
}
