/**
 * Fidelity gate for preset surfaces, in the direction that can silently mislead.
 *
 * A preset shadows a real package: under the native engine its source never loads,
 * so whatever the preset declares in `exports` IS the module's named-export surface.
 * If a preset declares a name the real package does not export, code importing that
 * name passes here and fails under Metro — the mock is more permissive than reality,
 * which is the one divergence a user cannot discover from a green run.
 *
 * The other direction (real names a preset omits) is a coverage gap, not a lie: the
 * import fails loudly and the fix is obvious. It is deliberately not gated here.
 *
 * The real surface is read with the TypeScript checker rather than a regex. A regex
 * over `.d.ts` cannot separate runtime exports from type-only ones, and returns
 * nothing at all for packages that use `export { }` or `export * from`.
 *
 * Only preset packages installed as devDependencies can be measured; the rest are
 * reported as skipped so the coverage of this gate is visible rather than implied.
 */
import { describe, it, expect } from "vitest";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Presets from "../src/presets/index.js";

const packageRoot = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const devDependencies: Record<string, string> =
  JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).devDependencies ?? {};
const containingFile = path.join(packageRoot, "__resolution_root__.ts");

const compilerOptions: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  skipLibCheck: true,
  noResolve: false,
  // Match how the engine resolves. No preset package currently ships a distinct
  // type entry behind this condition — resolution is byte-identical with and
  // without it today — but a package that adds one must be measured against its
  // native build, not its web build.
  customConditions: ["react-native"],
};

/**
 * Names a preset declares that the installed version of the real package does not
 * export, and the reason each one is kept anyway.
 *
 * Presets are not pinned to a single major, so a name removed by a newer release is
 * still correct for consumers on the older one. Every entry here is that case, and
 * every entry is asserted to still be needed — a name that comes back is a stale
 * exception, not a silent pass.
 *
 * A name that never existed in ANY version does not belong here. Those are bugs and
 * have been removed from the presets.
 */
const KNOWN_DIVERGENCES: Record<string, Record<string, string>> = {
  "react-native-reanimated": {
    useAnimatedGestureHandler: "removed in Reanimated 4; the supported API in 2.x/3.x",
    addWhitelistedUIProps: "removed in Reanimated 4; present through 3.x",
    addWhitelistedNativeProps: "removed in Reanimated 4; present through 3.x",
    configureProps: "removed in Reanimated 4; present through 3.x",
  },
  "react-native-gesture-handler": {
    Swipeable: "removed in gesture-handler 3; present through 2.x",
    DrawerLayout: "removed in gesture-handler 3; present through 2.x",
    gestureHandlerRootHOC: "removed in gesture-handler 3; present through 2.x",
    PureNativeButton: "removed in gesture-handler 3; present through 2.x",
  },
  "@gorhom/bottom-sheet": {
    useBottomSheetDynamicSnapPoints: "removed in bottom-sheet 5; present in 4.x",
  },
  "expo-status-bar": {
    setStatusBarBackgroundColor: "Android-only setter removed in SDK 53; present earlier",
    setStatusBarTranslucent: "Android-only setter removed in SDK 53; present earlier",
    setStatusBarNetworkActivityIndicatorVisible:
      "iOS-only setter removed in SDK 53; present earlier",
  },
};

interface RealSurface {
  entry: string;
  valueExports: Set<string>;
}

/** Type entry point for a package, as the checker would resolve it. */
function resolveTypeEntry(pkg: string): string | null {
  const resolved = ts.resolveModuleName(pkg, containingFile, compilerOptions, ts.sys);
  return resolved.resolvedModule?.resolvedFileName ?? null;
}

/**
 * Bare `export * from` specifiers in an entry file that do not resolve. The checker
 * drops everything behind an unresolved star silently, which would report the whole
 * re-exported surface as missing and turn every declared name into a false extra.
 */
function unresolvedStarTargets(source: ts.SourceFile): string[] {
  const unresolved: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (statement.exportClause) continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) continue;
    const target = ts.resolveModuleName(specifier.text, source.fileName, compilerOptions, ts.sys);
    if (!target.resolvedModule) unresolved.push(specifier.text);
  }
  return unresolved;
}

/** Every package any preset shadows, paired with the names that preset declares. */
function declaredSurfaces(): Map<string, { presets: Set<string>; exports: Set<string> }> {
  const byPackage = new Map<string, { presets: Set<string>; exports: Set<string> }>();
  for (const [presetName, factory] of Object.entries(Presets)) {
    const preset = (factory as () => { modules: Record<string, { exports: string[] }> })();
    for (const [pkg, module] of Object.entries(preset.modules)) {
      const entry = byPackage.get(pkg) ?? { presets: new Set(), exports: new Set() };
      entry.presets.add(presetName);
      for (const name of module.exports) entry.exports.add(name);
      byPackage.set(pkg, entry);
    }
  }
  return byPackage;
}

const declared = declaredSurfaces();

// One program over every resolvable entry — creating one per package re-reads the
// standard library each time and makes this gate cost seconds instead of hundreds
// of milliseconds.
const entries = new Map<string, string>();
for (const pkg of declared.keys()) {
  const entry = resolveTypeEntry(pkg);
  if (entry) entries.set(pkg, entry);
}
const program = ts.createProgram([...entries.values()], compilerOptions);
const checker = program.getTypeChecker();

const measured = new Map<string, RealSurface>();
const unmeasurable = new Map<string, string>();

for (const [pkg, entry] of entries) {
  const source = program.getSourceFile(entry);
  if (!source) {
    unmeasurable.set(pkg, `entry not in program: ${entry}`);
    continue;
  }
  const stars = unresolvedStarTargets(source);
  if (stars.length > 0) {
    unmeasurable.set(pkg, `unresolved export * from ${stars.join(", ")}`);
    continue;
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) {
    unmeasurable.set(pkg, `no module symbol for ${entry}`);
    continue;
  }
  const valueExports = new Set<string>();
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    let symbol = exported;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      try {
        symbol = checker.getAliasedSymbol(symbol);
      } catch {
        // An alias the checker cannot follow is not evidence either way; treating it
        // as a value keeps this gate from inventing a violation.
        valueExports.add(exported.name);
        continue;
      }
    }
    if (symbol.flags & ts.SymbolFlags.Value) valueExports.add(exported.name);
  }
  measured.set(pkg, { entry, valueExports });
}

/**
 * Names a preset declares that the real package does not export as a value.
 * `default` is excluded: presets return it from the factory and never list it in
 * `exports`, so it can never appear here, and a real default export is not a name a
 * consumer can destructure.
 */
function extraNames(pkg: string): string[] {
  const real = measured.get(pkg);
  const surface = declared.get(pkg);
  if (!real || !surface) return [];
  return [...surface.exports]
    .filter((name) => name !== "default" && !real.valueExports.has(name))
    .sort();
}

describe("preset surfaces do not over-declare", () => {
  it("measures every preset package installed as a devDependency", () => {
    // Without this the gate degrades silently: a package that stops resolving is
    // simply not checked, and the suite still reports green. Counting is not
    // enough either — with a dozen measurable packages, several could drop out
    // and still clear a threshold. The set is named, so any loss is a failure.
    const installed = new Set(Object.keys(devDependencies));
    const expected = [...declared.keys()].filter((pkg) => installed.has(pkg)).sort();
    expect([...measured.keys()].sort()).toEqual(expected);
  });

  it.each([...declared.keys()].filter((pkg) => measured.has(pkg)))(
    "%s declares no export the real package lacks",
    (pkg) => {
      const allowed = KNOWN_DIVERGENCES[pkg] ?? {};
      const unexplained = extraNames(pkg).filter((name) => !(name in allowed));
      expect(unexplained, `real surface read from ${measured.get(pkg)!.entry}`).toEqual([]);
    },
  );

  it("has no stale entries in the divergence list", () => {
    const stale: string[] = [];
    for (const [pkg, names] of Object.entries(KNOWN_DIVERGENCES)) {
      if (!measured.has(pkg)) continue;
      const extras = new Set(extraNames(pkg));
      for (const name of Object.keys(names)) {
        if (!extras.has(name)) stale.push(`${pkg}#${name}`);
      }
    }
    expect(stale, "these names no longer diverge — drop them from KNOWN_DIVERGENCES").toEqual([]);
  });

  it("explains every package it cannot measure", () => {
    // Not a failure — most preset packages are not installed here. This keeps the
    // gate's real coverage visible instead of letting silence read as a pass.
    for (const [pkg, reason] of unmeasurable) expect(reason, pkg).toBeTruthy();
    const unresolvable = [...declared.keys()].filter((pkg) => !entries.has(pkg));
    expect(unresolvable.length + measured.size + unmeasurable.size).toBe(declared.size);
  });
});
