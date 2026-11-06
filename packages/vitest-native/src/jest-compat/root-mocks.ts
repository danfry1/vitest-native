/**
 * Jest's automatic manual mocks for node_modules packages.
 *
 * Jest applies a `__mocks__/<package>` file beside the project's `node_modules` (in
 * each of its `roots`) to that package with no `jest.mock()` call: every `require` of
 * the package in a test, its setup files and the modules they load gets the mock
 * (jestjs.io/docs/manual-mocks#mocking-node-modules). A Node core module is the
 * exception: it needs an explicit `jest.mock()`. Vitest applies such a file only
 * through `vi.mock()`, so a suite that relied on it ran the real package.
 *
 * Read from disk on both sides: jestMockTransform() mocks what this finds in each test
 * and setup file, and `vitest-native migrate` lists the same files.
 */
import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

/** A mock file under a root's `__mocks__`, and the module it stands in for. */
export interface RootMock {
  /** The module request it mocks: `moti`, `@scope/pkg`, `pkg/sub`. */
  spec: string;
  /** The mock file, absolute. */
  file: string;
  /** The root whose `__mocks__` holds it. */
  root: string;
}

/** Jest's default moduleFileExtensions that hold code. */
const MOCK_FILE = /\.(?:[cm]?[jt]sx?)$/;

/** The package a request names: `@scope/pkg` for `@scope/pkg/sub`, `pkg` for `pkg/sub`. */
export function packageOfRequest(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Whether `pkg` is installed for `root`: its manifest, found walking node_modules upward. */
function installed(root: string, pkg: string): boolean {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules", pkg, "package.json"))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

function mockFiles(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : mockFiles(full);
    return entry.isFile() && MOCK_FILE.test(entry.name) ? [full] : [];
  });
}

/**
 * The mock files in each root's top-level `__mocks__` that stand in for an installed
 * package, in `roots` order. A request mocked in two roots keeps the first, as Jest
 * keeps the first it finds (with a "duplicate manual mock found" warning).
 */
export function findNodeModuleMocks(roots: readonly string[], projectRoot: string): RootMock[] {
  const found = new Map<string, RootMock>();
  for (const root of roots) {
    const dir = path.join(root, "__mocks__");
    for (const file of mockFiles(dir).sort()) {
      const spec = path.relative(dir, file).replace(MOCK_FILE, "").split(path.sep).join("/");
      if (found.has(spec) || isBuiltin(spec)) continue;
      if (!installed(projectRoot, packageOfRequest(spec))) continue;
      found.set(spec, { spec, file, root });
    }
  }
  return [...found.values()];
}
