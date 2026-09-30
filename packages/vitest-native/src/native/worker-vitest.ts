// Whether the hot worker would run the same Vitest as the project. Kept free of any
// Vitest import so the plugin can consult it at config time, where 'auto' turns a
// mismatch into a fallback; the pool (loaded only once hot is selected) turns it into
// an error for an explicit hotRuntime.
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";

/** A resolved Vitest install. */
export interface VitestInstall {
  path: string;
  version: string;
}

/**
 * Fail fast when the hot worker would load a different Vitest VERSION from the
 * project's.
 *
 * The worker entry ships inside this package, so its `import 'vitest/worker'`
 * resolves from THIS package's location rather than the project's. Where a monorepo
 * has more than one Vitest install — a linked package, a hoisted `node_modules`,
 * mixed versions across workspaces — the two can differ, and a version difference is
 * invisible at runtime: the start handshake succeeds, the run request is accepted,
 * and no result is ever reported. Vitest then prints "No test files found" with no
 * error at all, and on some paths still exits 0 — a green run that tested nothing.
 *
 * Only a VERSION difference is an error. Two installs of the same version are two
 * module registries but identical code, and they talk to each other perfectly well;
 * failing on the paths alone would block working monorepos where the same version is
 * simply installed twice.
 */
export function workerVitestMismatch(
  workerEntry: string,
  projectRoot: string,
): { worker: VitestInstall; project: VitestInstall } | null {
  const resolveVitest = (from: string): VitestInstall | null => {
    try {
      const require_ = createRequire(from);
      const pkgPath = require_.resolve("vitest/package.json");
      return { path: pkgPath, version: (require_(pkgPath) as { version: string }).version };
    } catch {
      return null;
    }
  };
  const worker = resolveVitest(workerEntry);
  const project = resolveVitest(path.join(projectRoot, "package.json"));
  // Either side unresolvable: say nothing. The worker's own import fails with a
  // clearer message than anything invented here, and a project without a resolvable
  // Vitest is not running this code at all.
  if (worker === null || project === null || worker.version === project.version) return null;
  return { worker, project };
}

/** The error for an explicit hotRuntime whose worker would run a different Vitest. */
export function workerVitestMismatchError(mismatch: {
  worker: VitestInstall;
  project: VitestInstall;
}): VitestNativeError {
  const { worker, project } = mismatch;
  return new VitestNativeError(
    "HOT_RUNTIME_UNAVAILABLE",
    `'hotRuntime' cannot run: its worker would load vitest@${worker.version}, ` +
      `but this run is driven by vitest@${project.version}. They talk over Vitest's worker ` +
      `protocol, and a version mismatch reports no results at all rather than failing.\n` +
      `  worker would load:  ${worker.path}\n` +
      `  project resolves:   ${project.path}\n` +
      `This happens when vitest-native and vitest resolve to different node_modules trees ` +
      `(linked packages, hoisted monorepo installs, mixed Vitest versions). Install one ` +
      `Vitest version reachable from vitest-native, or set 'hotRuntime: false'.`,
  );
}
