#!/usr/bin/env bun
/**
 * React Native API Compatibility Check
 *
 * Parses the real react-native index.js and compares every export against
 * our mock registry. Fails CI if new stable exports appear that we don't cover.
 *
 * Run: bun scripts/check-compat.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Exports we intentionally skip — unstable, experimental, or internal.
 * When RN promotes one of these to stable, remove it from this list
 * and add a mock. The script will catch it.
 */
const KNOWN_SKIPPED = new Set([
  'DevMenu',
  'experimental_LayoutConformance',
  'unstable_NativeText',
  'unstable_NativeView',
  'unstable_TextAncestorContext',
  'unstable_VirtualView',
  'VirtualViewMode',
]);

// ─── Find react-native ──────────────────────────────────────────────────────

function findRNIndexPath(): string {
  const candidates: string[] = [];

  // bun workspace layout — scan .bun cache for react-native versions
  const bunCacheDir = path.resolve('../../node_modules/.bun');
  if (fs.existsSync(bunCacheDir)) {
    for (const entry of fs.readdirSync(bunCacheDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('react-native@')) {
        candidates.push(
          path.resolve(bunCacheDir, entry.name, 'node_modules/react-native/index.js'),
        );
      }
    }
  }

  // standard hoisted
  candidates.push(path.resolve('../../node_modules/react-native/index.js'));
  // local
  candidates.push(path.resolve('node_modules/react-native/index.js'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    'Could not find react-native index.js. Run `bun install` first.',
  );
}

// ─── Parse real RN exports ───────────────────────────────────────────────────

function parseRNExports(indexPath: string): string[] {
  const source = fs.readFileSync(indexPath, 'utf-8');
  const exports: string[] = [];

  // Match `get ExportName()` in the module.exports object
  const regex = /^\s+get\s+(\w+)\s*\(\)/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    exports.push(match[1]);
  }

  return exports.sort();
}

// ─── Parse our mock registry ─────────────────────────────────────────────────

function parseOurExports(): string[] {
  const registryPath = path.resolve('src/mocks/registry.ts');
  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry not found at ${registryPath}`);
  }

  const source = fs.readFileSync(registryPath, 'utf-8');

  // Match top-level keys in the buildReactNativeMock return object.
  // These look like `    ExportName: createSomeMock(),` or `    ExportName: { ... },`
  const inBuildFn = source.slice(source.indexOf('buildReactNativeMock'));
  const regex = /^\s{4}(\w+)\s*:/gm;
  const exports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(inBuildFn)) !== null) {
    if (match[1] === 'default') continue;
    exports.push(match[1]);
  }

  return [...new Set(exports)].sort();
}

// ─── Parse dependency versions ───────────────────────────────────────────────

function getDepVersion(depName: string): string | null {
  try {
    const pkgPath = path.resolve('node_modules', depName, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
    }
    // Also check bun cache
    const bunCacheDir = path.resolve('../../node_modules/.bun');
    if (fs.existsSync(bunCacheDir)) {
      for (const entry of fs.readdirSync(bunCacheDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith(`${depName}@`)) {
          const p = path.resolve(bunCacheDir, entry.name, 'node_modules', depName, 'package.json');
          if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).version;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Run check ───────────────────────────────────────────────────────────────

function main() {
  console.log('React Native API Compatibility Check\n');

  // 1. Find and parse RN
  const rnPath = findRNIndexPath();
  const rnVersion = (() => {
    try {
      const pkgPath = path.resolve(path.dirname(rnPath), 'package.json');
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
    } catch { return 'unknown'; }
  })();
  const rnExports = parseRNExports(rnPath);
  console.log(`  react-native ${rnVersion} — ${rnExports.length} exports`);

  // 2. Parse our registry
  const ourExports = parseOurExports();
  console.log(`  vitest-native — ${ourExports.length} mocked exports`);

  // 3. Dependency versions
  const rntlVersion = getDepVersion('@testing-library/react-native');
  if (rntlVersion) console.log(`  @testing-library/react-native ${rntlVersion}`);
  const reactVersion = getDepVersion('react');
  if (reactVersion) console.log(`  react ${reactVersion}`);

  console.log('');

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
  const stale = ourExports.filter(e => !rnSet.has(e));

  // 6. Report
  if (skipped.length > 0) {
    console.log(`Intentionally skipped (${skipped.length}):`);
    for (const s of skipped) {
      console.log(`  - ${s}`);
    }
    console.log('');
  }

  if (stale.length > 0) {
    console.log(`Stale mocks — we mock these but RN ${rnVersion} no longer exports them:`);
    for (const s of stale) {
      console.log(`  - ${s}`);
    }
    console.log('  Consider removing these in the next major version.\n');
  }

  if (missing.length === 0) {
    const covered = rnExports.length - skipped.length;
    const coverage = (covered / rnExports.length * 100).toFixed(1);
    console.log(`OK — All stable exports covered (${covered}/${rnExports.length}, ${coverage}%)`);
    process.exit(0);
  }

  console.log(`FAIL — Missing ${missing.length} new export(s):\n`);
  for (const m of missing) {
    console.log(`  - ${m}`);
  }
  console.log('\nTo fix:');
  console.log('  1. Add a mock to src/mocks/ and register it in src/mocks/registry.ts');
  console.log('  2. Or add to KNOWN_SKIPPED in scripts/check-compat.ts if unstable/experimental');
  console.log('');

  process.exit(1);
}

main();
