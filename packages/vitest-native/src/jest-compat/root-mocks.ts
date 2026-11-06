/**
 * Jest's automatic manual mocks for node_modules packages, registered as Jest 29.7
 * registers them:
 *
 * - jest-haste-map crawls every root (`roots`, default `<rootDir>`), skipping
 *   node_modules and `modulePathIgnorePatterns`, and records each file whose path
 *   contains `/__mocks__/`, at any depth, under the path after the first `/__mocks__/`
 *   without its extension (getMockName): `src/__mocks__/moti.ts` and
 *   `__mocks__/moti.js` are both `moti`, `__mocks__/@scope/pkg.js` is `@scope/pkg`.
 *   A second file with the same name logs "duplicate manual mock found", and the file
 *   recorded later replaces the earlier one (`mocks.set`).
 * - jest-runtime's `requireModule` then loads that file for a request of the same
 *   name, `name` or else `name/index` (ModuleMap.getMockModule), with no `jest.mock()`
 *   call. A Node core module stays real, and an explicit `jest.mock(name, factory)` or
 *   `jest.unmock(name)` is decided first (`_explicitShouldMock`).
 *
 * Vitest applies such a file only through `vi.mock()`, so a suite that relied on it ran
 * the real package. jestMockTransform() mocks what this finds, ahead of the project's
 * setup files, and `vitest-native migrate` lists the same files.
 */
import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

/** A mock file under a `__mocks__` folder, and the request it stands in for. */
export interface RootMock {
  /** The module request it mocks: `moti`, `@scope/pkg`, `pkg/sub`. */
  spec: string;
  /** The mock file, absolute. */
  file: string;
  /** Whether it applies through Jest's `name/index` fallback (`__mocks__/pkg/index.js`). */
  viaIndex: boolean;
}

/** Two or more files registered under one name; Jest warns and keeps the last. */
export interface DuplicateMock {
  name: string;
  files: string[];
}

/** Jest's default moduleFileExtensions, less `node` (a binary addon is no mock source). */
const MOCK_FILE = /\.(?:[cm]?js|jsx|ts|tsx|json)$/;
const MOCKS_SEGMENT = `${path.sep}__mocks__${path.sep}`;
/**
 * Never crawled: node_modules and git's own data, as Jest skips them, and the build and
 * native folders an app tree holds, where a manual mock never lives and which are large
 * (CocoaPods alone made one app's crawl 167 ms). Jest crawls the latter unless
 * `modulePathIgnorePatterns` names them; skipping them by default changes which mocks
 * apply only for a mock kept inside a build output, which no project does on purpose.
 */
const SKIPPED = new Set([
  "node_modules",
  ".git",
  "ios",
  "android",
  "Pods",
  "build",
  ".expo",
  ".tmp",
  "dist",
]);

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

function readable(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every file under `dir` below a `__mocks__` folder, in a fixed (sorted) order. */
function crawl(dir: string, ignore: RegExp[], out: string[]): void {
  // A root that does not exist, or a folder that cannot be read, holds no mocks.
  const entries = readable(dir);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (SKIPPED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (ignore.some((pattern) => pattern.test(full))) continue;
    if (entry.isDirectory()) crawl(full, ignore, out);
    else if (entry.isFile() && full.includes(MOCKS_SEGMENT) && MOCK_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Jest's getMockName: the path after the first `/__mocks__/`, without its extension. */
function mockName(file: string): string {
  const inside = file.split(MOCKS_SEGMENT)[1];
  return inside
    .slice(0, inside.length - path.extname(inside).length)
    .split(path.sep)
    .join("/");
}

export interface ManualMocks {
  /** The node_modules packages and subpaths the mocks stand in for. */
  mocks: RootMock[];
  /** Names registered by more than one file. */
  duplicates: DuplicateMock[];
}

/**
 * Jest's `modulePathIgnorePatterns` entry as a regular expression, with `<rootDir>` replaced
 * by the project root as literal text: a root's own characters (`.`, `+`, Windows' `\`)
 * are not pattern syntax. Null for a pattern that is not a valid regular expression, which
 * then ignores nothing.
 */
export function ignorePattern(pattern: string, root: string): RegExp | null {
  const literalRoot = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(pattern.replaceAll("<rootDir>", literalRoot));
  } catch {
    return null;
  }
}

/**
 * The manual mocks Jest would apply to node_modules requests in this project: every
 * `__mocks__` file under `roots`, by name, kept when the name is not a Node core module
 * and its package is installed. `ignore` is Jest's `modulePathIgnorePatterns`, tested
 * against absolute paths as Jest tests them.
 */
// One crawl per set of roots, project and ignore patterns in this process: test.projects
// and every config resolution of a run share it.
const crawls = new Map<string, ManualMocks>();

export function findNodeModuleMocks(
  roots: readonly string[],
  projectRoot: string,
  ignore: readonly RegExp[] = [],
): ManualMocks {
  const key = JSON.stringify([roots, projectRoot, ignore.map(String)]);
  let found = crawls.get(key);
  if (!found) crawls.set(key, (found = findUncached(roots, projectRoot, ignore)));
  return found;
}

function findUncached(
  roots: readonly string[],
  projectRoot: string,
  ignore: readonly RegExp[],
): ManualMocks {
  const files: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const crawled: string[] = [];
    crawl(path.resolve(root), [...ignore], crawled);
    for (const file of crawled) {
      if (seen.has(file)) continue; // nested roots crawl a file once
      seen.add(file);
      files.push(file);
    }
  }

  const byName = new Map<string, string>();
  const collisions = new Map<string, string[]>();
  for (const file of files) {
    const name = mockName(file);
    const earlier = byName.get(name);
    if (earlier) collisions.set(name, [...(collisions.get(name) ?? [earlier]), file]);
    byName.set(name, file);
  }

  const mocks: RootMock[] = [];
  const add = (spec: string, file: string, viaIndex: boolean) => {
    if (isBuiltin(spec) || !installed(projectRoot, packageOfRequest(spec))) return;
    mocks.push({ spec, file, viaIndex });
  };
  for (const [name, file] of byName) {
    add(name, file, false);
    // getMockModule's fallback: `pkg/index` answers a request for `pkg`.
    const base = name.endsWith("/index") ? name.slice(0, -"/index".length) : null;
    if (base && !byName.has(base)) add(base, file, true);
  }
  return {
    mocks,
    duplicates: [...collisions].map(([name, list]) => ({ name, files: list })),
  };
}
