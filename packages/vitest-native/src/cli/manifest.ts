/**
 * Installed-package facts for the CLI, read from disk.
 *
 * `require.resolve('<pkg>/package.json')` is not a presence test: a package whose
 * `exports` does not list `./package.json` throws ERR_PACKAGE_PATH_NOT_EXPORTED
 * (@rolldown/plugin-babel 0.2.4 exports only "./dist/index.mjs"), so an installed
 * package read as missing. And a process with module hooks (the mock engine's test
 * runtime) answers `require.resolve` for preset packages that are not installed.
 * The manifest file itself is what a package manager writes, so look for it.
 */
import fs from "node:fs";
import path from "node:path";
import { AUTO_DETECT_PRESETS, testsItself, type PresetName } from "../preset-map.js";

/** A package's manifest, found by walking node_modules upward from root, or null. */
export function installedManifest(root: string, pkg: string): Record<string, unknown> | null {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "node_modules", pkg, "package.json");
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/** The installed major version of `pkg`, or null when absent or unversioned. */
export function installedMajor(root: string, pkg: string): number | null {
  const version = installedManifest(root, pkg)?.version;
  const major = typeof version === "string" ? Number.parseInt(version, 10) : NaN;
  return Number.isNaN(major) ? null : major;
}

/**
 * Whether the installed `pkg` runs its own test mode under Vitest, so no preset
 * replaces it — preset-map's `testsItself`, the rule the plugin applies.
 */
export function installedTestsItself(root: string, pkg: string): boolean {
  return testsItself(pkg, installedManifest(root, pkg)?.version);
}

/**
 * The presets a run in this project enables, decided as the plugin decides it: a
 * preset is active when one of its packages is installed and does not test itself,
 * and the user has not switched it off.
 */
export function activePresets(root: string, disabled: readonly string[] = []): PresetName[] {
  const active = new Set<PresetName>();
  for (const [pkg, preset] of Object.entries(AUTO_DETECT_PRESETS)) {
    if (disabled.includes(preset)) continue;
    if (installedManifest(root, pkg) && !installedTestsItself(root, pkg)) active.add(preset);
  }
  return [...active];
}
