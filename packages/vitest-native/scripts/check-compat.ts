#!/usr/bin/env bun
/**
 * React Native API Compatibility Check
 *
 * Parses the real react-native index.js and compares every export against
 * our mock registry. Fails CI if new stable exports appear that we don't cover.
 *
 * Run: bun scripts/check-compat.ts
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Exports we intentionally skip — unstable, experimental, or internal.
 * When RN promotes one of these to stable, remove it from this list
 * and add a mock. The script will catch it.
 */
const KNOWN_SKIPPED = new Set([
  "DevMenu",
  "experimental_LayoutConformance",
  "unstable_NativeText",
  "unstable_NativeView",
  "unstable_TextAncestorContext",
  "unstable_VirtualView",
  "VirtualViewMode",
  // Experimental virtualized-collection API (RN 0.86+)
  "unstable_DEFAULT_INITIAL_NUM_TO_RENDER",
  "unstable_VirtualArray",
  "unstable_VirtualColumn",
  "unstable_VirtualColumnGenerator",
  "unstable_VirtualRow",
  "unstable_createVirtualCollectionView",
  "unstable_getScrollParent",
]);

const REQUIRED_EXPORTS = ["View", "Text", "Platform", "StyleSheet", "NativeModules"];

// ─── Find react-native ──────────────────────────────────────────────────────

export interface ResolvedPackage {
  packageJsonPath: string;
  packageRoot: string;
  version: string;
}

/** Resolve exactly as code in the package under test would resolve. */
export function resolveInstalledPackage(
  depName: string,
  fromDirectory = packageRoot,
): ResolvedPackage {
  const requireFromPackage = createRequire(path.join(fromDirectory, "package.json"));
  let packageJsonPath: string | undefined;

  try {
    packageJsonPath = requireFromPackage.resolve(`${depName}/package.json`);
  } catch {
    const entryPath = requireFromPackage.resolve(depName);
    let current = path.dirname(entryPath);
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, "package.json");
      if (fs.existsSync(candidate)) {
        const candidatePackage = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (candidatePackage.name === depName) {
          packageJsonPath = candidate;
          break;
        }
      }
      current = path.dirname(current);
    }
  }

  if (!packageJsonPath) {
    throw new Error(`Could not find ${depName}. Run \`bun install\` first.`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return {
    packageJsonPath,
    packageRoot: path.dirname(packageJsonPath),
    version: packageJson.version ?? "unknown",
  };
}

function findRNIndexPath(rnPackage: ResolvedPackage): string {
  const packageJson = JSON.parse(fs.readFileSync(rnPackage.packageJsonPath, "utf8"));
  const indexPath = path.resolve(rnPackage.packageRoot, packageJson.main ?? "index.js");
  if (fs.existsSync(indexPath)) return indexPath;

  throw new Error(`Could not find react-native entry point at ${indexPath}.`);
}

// ─── Parse real RN exports ───────────────────────────────────────────────────

export function parseRNExports(indexPath: string): string[] {
  const source = fs.readFileSync(indexPath, "utf-8");
  const exports: string[] = [];

  // Match `get ExportName()` in the module.exports object
  const getterRegex = /^\s{2}get\s+(\w+)\s*\(\)/gm;
  let match: RegExpExecArray | null;
  while ((match = getterRegex.exec(source)) !== null) {
    exports.push(match[1]);
  }

  // RN also exposes occasional direct methods in the object (for example,
  // unstable_batchedUpdates<T>(...)). Keep those in the public export set.
  const methodRegex = /^\s{2}([A-Za-z_$][\w$]*)(?:<[^>\n]+>)?\s*\(/gm;
  while ((match = methodRegex.exec(source)) !== null) {
    exports.push(match[1]);
  }

  return [...new Set(exports)].sort();
}

export function validateRNExportShape(exports: string[]): void {
  const missingRequired = REQUIRED_EXPORTS.filter((name) => !exports.includes(name));
  if (exports.length < 50 || missingRequired.length > 0) {
    throw new Error(
      "Could not confidently parse React Native's runtime exports. " +
        `Found ${exports.length}; missing required exports: ${missingRequired.join(", ") || "none"}. ` +
        "React Native may have changed its index.js export syntax; update the parser before making coverage claims.",
    );
  }
}

// ─── Parse our mock registry ─────────────────────────────────────────────────

function parseOurExports(): string[] {
  const registryPath = path.resolve(packageRoot, "src/mocks/registry.ts");
  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry not found at ${registryPath}`);
  }

  const source = fs.readFileSync(registryPath, "utf-8");

  // Match top-level keys in the buildReactNativeMock return object.
  // These look like `    ExportName: createSomeMock(),` or `    ExportName: { ... },`
  const inBuildFn = source.slice(source.indexOf("buildReactNativeMock"));
  const regex = /^\s{4}(\w+)\s*:/gm;
  const exports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(inBuildFn)) !== null) {
    if (match[1] === "default") continue;
    exports.push(match[1]);
  }

  return [...new Set(exports)].sort();
}

// ─── Parse dependency versions ───────────────────────────────────────────────

function getDepVersion(depName: string): string | null {
  try {
    return resolveInstalledPackage(depName).version;
  } catch {
    /* ignore */
  }
  return null;
}

// ─── Run check ───────────────────────────────────────────────────────────────

function main() {
  console.log("React Native API Compatibility Check\n");

  // 1. Find and parse RN
  const rnPackage = resolveInstalledPackage("react-native");
  const rnPath = findRNIndexPath(rnPackage);
  const rnVersion = rnPackage.version;
  const expectedVersion = process.env.VITEST_NATIVE_EXPECTED_RN_VERSION;
  if (expectedVersion && rnVersion !== expectedVersion) {
    throw new Error(
      `Resolved react-native ${rnVersion}, but the compatibility job expected ${expectedVersion}. ` +
        `Resolved package: ${rnPackage.packageJsonPath}`,
    );
  }
  const rnExports = parseRNExports(rnPath);
  validateRNExportShape(rnExports);
  console.log(`  react-native ${rnVersion} — ${rnExports.length} exports`);
  console.log(`  resolved package — ${rnPackage.packageJsonPath}`);

  // 2. Parse our registry
  const ourExports = parseOurExports();
  console.log(`  vitest-native — ${ourExports.length} mocked exports`);

  // 3. Dependency versions
  const rntlVersion = getDepVersion("@testing-library/react-native");
  if (rntlVersion) console.log(`  @testing-library/react-native ${rntlVersion}`);
  const reactVersion = getDepVersion("react");
  if (reactVersion) console.log(`  react ${reactVersion}`);

  console.log("");

  // 4. Find gaps
  const ourSet = new Set(ourExports);
  const missing: string[] = [];
  const skipped: string[] = [];

  for (const exp of rnExports) {
    if (ourSet.has(exp)) continue;
    if (KNOWN_SKIPPED.has(exp)) {
      skipped.push(exp);
    } else {
      missing.push(exp);
    }
  }

  // 5. Check for stale mocks
  const rnSet = new Set(rnExports);
  const stale = ourExports.filter((e) => !rnSet.has(e));

  // 6. Report
  if (skipped.length > 0) {
    console.log(`Intentionally skipped (${skipped.length}):`);
    for (const s of skipped) {
      console.log(`  - ${s}`);
    }
    console.log("");
  }

  if (stale.length > 0) {
    console.log(`Stale mocks — we mock these but RN ${rnVersion} no longer exports them:`);
    for (const s of stale) {
      console.log(`  - ${s}`);
    }
    console.log("  Consider removing these in the next major version.\n");
  }

  if (missing.length === 0) {
    const stableExports = rnExports.length - skipped.length;
    console.log(
      `OK — All stable exports covered (${stableExports}/${stableExports}, 100%); ` +
        `${skipped.length} of ${rnExports.length} total exports intentionally skipped`,
    );
    process.exit(0);
  }

  console.log(`FAIL — Missing ${missing.length} new export(s):\n`);
  for (const m of missing) {
    console.log(`  - ${m}`);
  }
  console.log("\nTo fix:");
  console.log("  1. Add a mock to src/mocks/ and register it in src/mocks/registry.ts");
  console.log("  2. Or add to KNOWN_SKIPPED in scripts/check-compat.ts if unstable/experimental");
  console.log("");

  process.exit(1);
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : null;
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) main();
