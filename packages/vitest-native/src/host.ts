// The Vite and Vitest that are actually running, rather than the packages a lookup by
// name happens to find from the project root.
//
// A lookup by name answers a different question. Under Vite+ the package named `vite`
// is VoidZero's core, whose manifest carries its own version (1.3.0) rather than the
// Vite it bundles (8.x), so a check reading `vite/package.json` rejects every run. And
// Vite+ brings `vitest` as its own dependency: under pnpm the project root may not
// resolve `vitest` at all, though the run is driven by one.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "./errors.mjs";

/**
 * The version of the Vite running this config.
 *
 * Vite 7 and later state it on every hook's context (`this.meta.viteVersion`). Vite 6
 * does not, so there the version is the `version` export of the `vite` module that this
 * package resolves. That fallback is a lookup by name: it is right when this package and
 * the running Vite resolve the same copy, and under a wrapper whose `vite` module
 * reports the Vite it bundles, but nothing checks that they do.
 */
export async function runningViteVersion(context: unknown): Promise<string | null> {
  return (await runningVite(context))?.version ?? null;
}

/** The running Vite's version, and where it was read, for messages that name it. */
export async function runningVite(
  context: unknown,
): Promise<{ version: string; source: string } | null> {
  const fromHost = (context as { meta?: { viteVersion?: unknown } } | undefined)?.meta?.viteVersion;
  if (typeof fromHost === "string") return { version: fromHost, source: "the running Vite" };
  try {
    const vite = (await import("vite")) as { version?: unknown };
    if (typeof vite.version !== "string") return null;
    let at = "";
    try {
      at = ` at ${path.dirname(createRequire(import.meta.url).resolve("vite/package.json"))}`;
    } catch {
      // The module loaded, so the version stands without a location.
    }
    return { version: vite.version, source: `the vite module${at}` };
  } catch {
    return null;
  }
}

/**
 * The version of Vite installed where `root` resolves it, read from the module, for
 * diagnostics that run without a Vite process (`doctor`, `migrate`). Falls back to the
 * manifest, preferring the Vite version a wrapper records it bundles.
 */
export function installedViteVersion(root: string): string | null {
  const req = createRequire(path.join(root, "package.json"));
  try {
    const version = (req("vite") as { version?: unknown }).version;
    if (typeof version === "string") return version;
  } catch {
    // An install whose module cannot load here still has a manifest to read.
  }
  try {
    const manifest = req("vite/package.json") as {
      version?: string;
      bundledVersions?: { vite?: string };
    };
    return manifest.bundledVersions?.vite ?? manifest.version ?? null;
  } catch {
    return null;
  }
}

/** Whether the project at `root` runs its tests through Vite+. */
export function usesVitePlus(root: string): boolean {
  try {
    createRequire(path.join(root, "package.json")).resolve("vite-plus/package.json");
    return true;
  } catch {
    return false;
  }
}

/** The `vitest` package this package's own files resolve by name, or null. */
export function ownVitestPackage(): { root: string; version: string } | null {
  try {
    const req = createRequire(import.meta.url);
    const manifest = req.resolve("vitest/package.json");
    const { version } = req(manifest) as { version: string };
    return { root: realPath(path.dirname(manifest)), version };
  } catch {
    return null;
  }
}

/**
 * A path's canonical spelling for comparison. `realpathSync.native` asks the OS, which
 * returns the on-disk case on Windows and macOS; Windows paths are also compared without
 * case, since NTFS lookups ignore it.
 */
function realPath(file: string): string {
  const real = fs.realpathSync.native(file);
  return process.platform === "win32" ? real.toLowerCase() : real;
}

/** The directory of the package that contains `file`, by its nearest package.json. */
function packageRootOf(file: string): string {
  let dir = realPath(file);
  const start = dir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function twinError(
  running: { root: string; version: string },
  other: string,
  via: string,
  alternative = "",
): VitestNativeError {
  return new VitestNativeError(
    "VITEST_TWIN_INSTANCE",
    `Two copies of Vitest are installed, and ${via} loads the one that is not running.\n` +
      `  running:  vitest@${running.version} at ${running.root}\n` +
      `  loaded:   ${other}\n` +
      `Suites register with a Vitest that is not collecting them, so every test file would ` +
      `fail. Install one Vitest that both resolve, for example by removing the project's own ` +
      `\`vitest\` when a wrapper such as Vite+ provides it, or by deduplicating the install.` +
      alternative,
  );
}

/**
 * Fail fast when what the host actually loads for vitest-native's own `import 'vitest'`
 * is not the running Vitest.
 *
 * A second physical copy is not a problem by itself: Vitest's own resolver maps every
 * `vitest` import in a module it runs (setup files included) to the running copy, which
 * is how peer-variant installs (two copies of the same version) work. So the question is
 * put to the host, through the project's Vite resolver, for the file that imports it.
 */
export async function assertHostResolvesRunningVitest(
  running: { distPath: string; version: string },
  resolveId: (id: string, importer: string) => Promise<{ id: string } | string | null | undefined>,
  importer: string,
): Promise<void> {
  const resolved = await resolveId("vitest", importer);
  const id = typeof resolved === "string" ? resolved : resolved?.id;
  if (!id || !path.isAbsolute(id) || !fs.existsSync(id)) return;
  const runningRoot = packageRootOf(running.distPath);
  const loadedRoot = packageRootOf(id);
  if (loadedRoot === runningRoot) return;
  throw twinError(
    { root: runningRoot, version: running.version },
    loadedRoot,
    "the Vite resolver, for vitest-native's setup file,",
  );
}

/**
 * Fail fast when the hot runtime's worker, which Node loads directly and so outside
 * Vitest's resolver, would import a different physical copy of Vitest from the running
 * one.
 */
export function assertHotWorkerLoadsRunningVitest(
  running: { distPath: string; version: string },
  workerEntry: string,
): void {
  let manifest: string;
  try {
    manifest = createRequire(workerEntry).resolve("vitest/package.json");
  } catch {
    return; // The worker's own import then fails with Node's error, which names it.
  }
  const runningRoot = packageRootOf(running.distPath);
  const loadedRoot = realPath(path.dirname(manifest));
  if (loadedRoot === runningRoot) return;
  throw twinError(
    { root: runningRoot, version: running.version },
    loadedRoot,
    "the hot runtime's worker",
    " Or set `hotRuntime: false`: per-file isolation loads Vitest through Vitest's own " +
      "resolver, which reaches the running copy.",
  );
}
