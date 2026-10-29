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
 * does not, so there the version comes from the `vite` module this package resolves,
 * which is the one Vitest itself imports in every supported layout. That fallback is
 * still a lookup by name; it reads the module's own `version` export rather than its
 * manifest, which is what keeps it right under Vite+.
 */
export async function runningViteVersion(context: unknown): Promise<string | null> {
  const fromHost = (context as { meta?: { viteVersion?: unknown } } | undefined)?.meta?.viteVersion;
  if (typeof fromHost === "string") return fromHost;
  try {
    const vite = (await import("vite")) as { version?: unknown };
    return typeof vite.version === "string" ? vite.version : null;
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

/** The `vitest` package this package's own runtime files import, or null. */
export function ownVitestPackage(): { root: string; version: string } | null {
  try {
    const req = createRequire(import.meta.url);
    const manifest = req.resolve("vitest/package.json");
    const { version } = req(manifest) as { version: string };
    return { root: fs.realpathSync(path.dirname(manifest)), version };
  } catch {
    return null;
  }
}

/** The package directory holding Vitest's built `dist` directory. */
function packageRootOf(distPath: string): string {
  let dir = fs.realpathSync(distPath);
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return fs.realpathSync(distPath);
    dir = parent;
  }
}

/**
 * Fail fast when this package's runtime would load a different physical copy of Vitest
 * from the one running.
 *
 * vitest-native's setup files and workers import `vitest` from this package's location.
 * When that resolves to another copy (a project that keeps its own `vitest` beside a
 * wrapper's, a linked package, a hoisted monorepo), suites register with a Vitest that
 * is not collecting them, and every file fails with an error that names neither copy.
 * Real paths are compared, so the same copy reached through symlinks (pnpm, bun) is one
 * copy. When this package cannot resolve `vitest` at all, nothing is decided here: its
 * own imports fail with Node's error, which names the package.
 */
export function assertRunningVitestIsOwn(running: { distPath: string; version: string }): void {
  const own = ownVitestPackage();
  if (own === null) return;
  const runningRoot = packageRootOf(running.distPath);
  if (runningRoot === own.root) return;
  throw new VitestNativeError(
    "VITEST_TWIN_INSTANCE",
    `Two copies of Vitest are installed, and vitest-native would bind to the one that is ` +
      `not running.\n` +
      `  running:              vitest@${running.version} at ${runningRoot}\n` +
      `  vitest-native loads:  vitest@${own.version} at ${own.root}\n` +
      `Every test file would fail, because suites register with a Vitest that is not ` +
      `collecting them. Install one Vitest that both the runner and vitest-native resolve, ` +
      `for example by removing the project's own \`vitest\` when a wrapper such as Vite+ ` +
      `provides it, or by deduplicating the install.`,
  );
}
