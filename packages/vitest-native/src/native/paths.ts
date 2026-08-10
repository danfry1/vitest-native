import path from "node:path";

/**
 * Does `dir` contain `target` (or equal it)?
 *
 * Used to recognise the package the run lives in. A package directory that contains
 * the Vitest root is the project, not a dependency of it — externalizing it hands
 * Vitest its own source and test files back through Node, where they are compiled to
 * CommonJS. Two separate paths reach that conclusion (auto-detection in ecosystem.ts
 * and the `transform` option in apply.ts), so the comparison lives in one place.
 *
 * Compared case-insensitively on Windows: `require.resolve` reports the on-disk
 * casing while a working directory carries whatever the shell supplied, and a
 * drive-letter difference alone would silently defeat the check.
 */
export function containsPath(dir: string, target: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const outer = normalize(dir);
  const inner = normalize(target);
  return inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
}
