/**
 * Babel plugin classification shared by the engine (projectBabel) and the CLI (doctor,
 * migrate): what a project's Babel plugins do under vitest-native.
 */
import type { PresetName } from "./preset-map.js";
import path from "node:path";
import { installedManifest } from "./installed-manifest.js";

export interface BabelPluginEntry {
  /** As written in the config (`'macros'`). */
  written: string;
  /** Babel's normalized name (`babel-plugin-macros`). */
  name: string;
  options?: unknown;
}

export interface BabelConfigReport {
  /** The config file(s) read, joined with " + ", or null when there is none. */
  source: string | null;
  /** False when any file could only be scanned as text. */
  evaluated: boolean;
  plugins: BabelPluginEntry[];
  presets: string[];
  /** The presets with their options, as listed (for the engine's projectBabel classification). */
  presetEntries?: BabelPluginEntry[];
  /**
   * The settings that make babel-jest compile imports into lazy `require()` calls, as the
   * report names them (`babel-preset-expo lazyImports`). See lazyImportSettings.
   */
  lazyImports: string[];
}

/**
 * @babel/core's `standardizeName` (lib/config/files/plugins.js), rule for rule except that a name
 * starting with `.` is taken as a relative path: `foo` →
 * `babel-plugin-foo`, `@babel/foo` → `@babel/plugin-foo` (`@babel/plugin-foo` unchanged),
 * `@scope/foo` → `@scope/babel-plugin-foo`, `@scope` → `@scope/babel-plugin`, `module:foo` →
 * `foo`. A relative or absolute path is returned as written.
 */
export function normalizeBabelName(name: string, kind: "plugin" | "preset" = "plugin"): string {
  if (name.startsWith(".") || path.isAbsolute(name)) return name;
  const prefix = new RegExp(`^(?!@|module:|[^/]+/|babel-${kind}-)`);
  const babelOrg = new RegExp(`^(@babel/)(?!${kind}-|[^/]+/)`);
  const otherOrg = new RegExp(`^(@(?!babel/)[^/]+/)(?![^/]*babel-${kind}(?:-|/|$)|[^/]+/)`);
  return name
    .replace(prefix, `babel-${kind}-`)
    .replace(babelOrg, `$1${kind}-`)
    .replace(otherOrg, `$1babel-${kind}-`)
    .replace(/^(@(?!babel$)[^/]+)$/, `$1/babel-${kind}`)
    .replace(/^module:/, "");
}

export type BabelPluginVerdict = "required" | "alias" | "unneeded" | "unknown";

interface KnownPlugin {
  names: string[];
  verdict: BabelPluginVerdict;
  reason: (entry: BabelPluginEntry, active: readonly PresetName[]) => string;
}

/**
 * Whether real Reanimated or Worklets code can run in a test, so the worklets Babel plugin
 * matters: whenever either is installed. A preset standing in for the library does not
 * change that: Reanimated 4.7+ runs as its own mock, whose hooks are the real ones, and with
 * an older Reanimated (or the mock engine) a mock that loads the library itself
 * (`jest.requireActual('react-native-reanimated')`) hands the real hooks to the components
 * it renders. Those components are compiled where they live, not where the mock is, so no
 * file can be told apart; the plugin is kept for every file it applies to, as under Jest.
 */
export function realWorkletsCanRun(root: string): boolean {
  return (
    installedManifest(root, "react-native-reanimated") !== null ||
    installedManifest(root, "react-native-worklets") !== null
  );
}

/** Whether `name` is one of the plugins this module knows by name. */
export const isKnownPlugin = (name: string): boolean =>
  KNOWN_PLUGINS.some((known) => known.names.includes(name));

const KNOWN_PLUGINS: KnownPlugin[] = [
  {
    names: ["babel-plugin-macros", "@lingui/babel-plugin-lingui-macro"],
    verdict: "required",
    reason: (e) =>
      `${e.written} compiles macro imports away at build time; without it the macro module is imported ` +
      `for real and fails (e.g. "Cannot find module 'babel-plugin-macros'").`,
  },
  {
    names: ["babel-plugin-module-resolver"],
    verdict: "alias",
    reason: () => `module-resolver rewrites import paths; its aliases map onto resolve.alias.`,
  },
  { names: ["react-native-worklets/plugin"], verdict: "unneeded", reason: () => "" },
  { names: ["react-native-reanimated/plugin"], verdict: "unneeded", reason: () => "" },
  {
    names: ["babel-plugin-react-compiler"],
    verdict: "unneeded",
    reason: () =>
      `React Compiler only adds memoization to components that follow the Rules of React ` +
      `(react.dev/learn/react-compiler); they render the same without it.`,
  },
];

export interface ClassifiedPlugin extends BabelPluginEntry {
  verdict: BabelPluginVerdict;
  reason: string;
}

const unknownReason = (e: BabelPluginEntry) =>
  `${e.written} ran on every file under babel-jest and does not run under vitest-native; check whether tests depend on what it does.`;

export function classifyBabelPlugins(
  report: BabelConfigReport,
  root: string,
  active: readonly PresetName[],
): ClassifiedPlugin[] {
  return report.plugins.map((entry) => {
    const worklets = /^(react-native-worklets|react-native-reanimated)\/plugin$/.exec(entry.name);
    if (worklets) {
      if (!realWorkletsCanRun(root)) {
        return {
          ...entry,
          verdict: "unneeded",
          reason: `${entry.written} transforms worklets for ${worklets[1]}, which is not installed.`,
        };
      }
      return {
        ...entry,
        verdict: "required",
        reason:
          `${entry.written} gives Reanimated's hooks their dependencies. Real Reanimated runs in ` +
          `tests (as its own mock from 4.7, or through a mock that loads ` +
          `jest.requireActual('react-native-reanimated')), and its useAnimatedStyle throws ` +
          `without it ("used without a dependency array or Babel plugin").`,
      };
    }
    const known = KNOWN_PLUGINS.find((k) => k.names.includes(entry.name));
    if (known) return { ...entry, verdict: known.verdict, reason: known.reason(entry, active) };
    if (/(^|[/-])macros?($|[/-])/.test(entry.name)) {
      return {
        ...entry,
        verdict: "required",
        reason: `${entry.written} looks like a macro plugin; macros are compiled away at build time and fail when imported for real.`,
      };
    }
    return { ...entry, verdict: "unknown", reason: unknownReason(entry) };
  });
}
