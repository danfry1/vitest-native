import { createRequire } from "node:module";
import path from "node:path";
import { AUTO_DETECT_PRESETS } from "../preset-map.js";

/**
 * Packages that must never be auto-inlined even though they depend on React
 * Native. The test library and the renderers underneath it are infrastructure the
 * engine itself wires up; pulling a second copy of them into the module graph has
 * corrupted rendering before, in ways that surface as unrelated act() and
 * host-component failures.
 */
const NEVER_INLINE = new Set([
  "@testing-library/react-native",
  "react-test-renderer",
  "test-renderer",
  "react-native",
]);

/** Manifest fields that make a package part of the React Native ecosystem. */
function dependsOnReactNative(manifest: Record<string, unknown>): boolean {
  for (const field of ["dependencies", "peerDependencies"]) {
    const deps = manifest[field];
    if (deps && typeof deps === "object" && "react-native" in (deps as object)) return true;
  }
  return false;
}

/**
 * Packages in the project that declare React Native in their own manifest.
 *
 * These are the ones published the way the React Native ecosystem publishes:
 * untranspiled JSX, Flow, or TypeScript, on the assumption that Metro will compile
 * them. Node cannot run that source, which is why they previously had to be listed
 * by hand in `transform: [...]` — a list every project had to discover the hard way,
 * one `SyntaxError: Unexpected token '<'` at a time.
 *
 * A package's own manifest is the authority here rather than a heuristic on its
 * name: `react-native-*` misses `@gorhom/bottom-sheet` and would wrongly claim
 * `react-native` itself, while the manifest states the relationship exactly.
 *
 * Only the project's own declared dependencies are considered — resolving each is
 * cheap and predictable, where walking the whole tree depends on the package
 * manager's layout and would pull in packages the project never asked for.
 * Transitive cases stay available through `transform: [...]`.
 *
 * Excluded: packages a preset already shadows (their real source never loads), the
 * test infrastructure in NEVER_INLINE, and anything the consumer listed explicitly
 * in `transform` — that option keeps its existing meaning and takes precedence.
 */
export function detectEcosystemPackages(projectRoot: string, explicit: string[] = []): string[] {
  const req = createRequire(path.join(projectRoot, "package.json"));
  let manifest: Record<string, unknown>;
  try {
    manifest = req(path.join(projectRoot, "package.json")) as Record<string, unknown>;
  } catch {
    return [];
  }

  const skip = new Set<string>([...NEVER_INLINE, ...Object.keys(AUTO_DETECT_PRESETS), ...explicit]);
  const candidates = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = manifest[field];
    if (deps && typeof deps === "object") {
      for (const name of Object.keys(deps as object)) candidates.add(name);
    }
  }

  const detected: string[] = [];
  for (const name of candidates) {
    if (skip.has(name) || name.startsWith("@react-native/")) continue;
    try {
      const pkg = req(`${name}/package.json`) as Record<string, unknown>;
      if (dependsOnReactNative(pkg)) detected.push(name);
    } catch {
      // Not installed, or no exported manifest — nothing to inline either way.
    }
  }
  return detected.sort();
}
