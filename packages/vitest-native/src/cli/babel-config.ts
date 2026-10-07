/**
 * The project's Babel configuration, as `migrate` and `doctor` need to see it.
 *
 * babel-jest applies the project's Babel config to every file; vitest-native never
 * does (website/guide/how-it-works.md). Most plugins in a React Native config exist
 * for Metro, but a macro plugin changes what code means: without it the macro
 * package is imported for real and fails (`Cannot find module
 * 'babel-plugin-macros'`), an error that names nothing about Babel.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { AUTO_DETECT_PRESETS, presetShadowing, type PresetName } from "../preset-map.js";
import { installedManifest, installedMajor } from "./manifest.js";

// https://babeljs.io/docs/config-files: one project-wide config, plus one
// file-relative config (.babelrc* or package.json#babel). Babel merges the two.
const PROJECT_FILES = [
  "babel.config.js",
  "babel.config.cjs",
  "babel.config.mjs",
  "babel.config.json",
  "babel.config.cts",
  "babel.config.ts",
];
const RELATIVE_FILES = [".babelrc", ".babelrc.js", ".babelrc.cjs", ".babelrc.mjs", ".babelrc.json"];

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
}

/**
 * @babel/core's `standardizeName`: `foo` → `babel-plugin-foo`, `@scope/foo` →
 * `@scope/babel-plugin-foo`, `@scope` → `@scope/babel-plugin`, `module:foo` → `foo`.
 */
export function normalizeBabelName(name: string, kind: "plugin" | "preset" = "plugin"): string {
  const prefix = `babel-${kind}`;
  if (name.startsWith("module:")) return name.slice("module:".length);
  if (name.startsWith(".") || path.isAbsolute(name)) return name;
  if (/^@[^/]+$/.test(name)) return `${name}/${prefix}`;
  const scoped = /^(@[^/]+)\/(.+)$/.exec(name);
  if (scoped) {
    return scoped[2].startsWith(prefix) ? name : `${scoped[1]}/${prefix}-${scoped[2]}`;
  }
  if (name.includes("/") || name.startsWith(`${prefix}-`)) return name;
  return `${prefix}-${name}`;
}

function entryOf(item: unknown, kind: "plugin" | "preset"): BabelPluginEntry {
  const [target, options] = Array.isArray(item) ? item : [item, undefined];
  if (typeof target !== "string")
    return { written: "<inline plugin>", name: "<inline plugin>", options };
  return { written: target, name: normalizeBabelName(target, kind), options };
}

/** The `api` babel-jest's Babel passes a function config: env 'test', caller babel-jest. */
function babelApi() {
  const cache = Object.assign(() => {}, {
    forever: () => {},
    never: () => {},
    using: (fn: () => unknown) => fn(),
    invalidate: (fn: () => unknown) => fn(),
  });
  return {
    version: "7.0.0",
    cache,
    assertVersion: () => {},
    env: (value?: unknown) =>
      value === undefined
        ? "test"
        : typeof value === "function"
          ? (value as (env: string) => unknown)("test")
          : Array.isArray(value)
            ? value.includes("test")
            : value === "test",
    caller: (fn: (caller: Record<string, unknown>) => unknown) =>
      fn({ name: "babel-jest", supportsDynamicImport: false, supportsStaticESM: false }),
  };
}

/** Evaluate one config file; undefined when it can only be scanned as text. */
function evaluate(root: string, file: string): unknown {
  const text = fs.readFileSync(file, "utf8");
  if (/(^|\/)\.babelrc$|\.json$/.test(file)) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined; // JSON5 or comments
    }
  }
  if (!/\.c?js$/.test(file)) return undefined; // ESM/TS: not loadable synchronously
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV ??= "test";
  try {
    const loaded = createRequire(path.join(root, "package.json"))(file) as unknown;
    const exported =
      loaded && typeof loaded === "object" && "default" in loaded
        ? (loaded as { default: unknown }).default
        : loaded;
    const value =
      typeof exported === "function"
        ? (exported as (api: unknown) => unknown)(babelApi())
        : exported;
    // An async config resolves too late to read here.
    if (value && typeof (value as { then?: unknown }).then === "function") return undefined;
    return value;
  } catch {
    return undefined;
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
}

interface RawConfig {
  plugins?: unknown;
  presets?: unknown;
  env?: Record<string, RawConfig>;
  overrides?: unknown;
}

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function entriesOf(config: RawConfig, key: "plugins" | "presets"): unknown[] {
  // Babel merges env[envName] (envName is 'test' under Jest); overrides apply per
  // file and are included so none is missed.
  const sections = [config, config.env?.test ?? {}, ...array(config.overrides)] as RawConfig[];
  return sections.flatMap((s) => array(s?.[key]));
}

export function readBabelConfig(root: string): BabelConfigReport {
  const found: { source: string; raw: unknown; text: string }[] = [];
  for (const group of [PROJECT_FILES, RELATIVE_FILES]) {
    const name = group.find((n) => fs.existsSync(path.join(root, n)));
    if (!name) continue;
    const file = path.join(root, name);
    found.push({ source: name, raw: evaluate(root, file), text: fs.readFileSync(file, "utf8") });
  }
  if (!found.some((f) => f.source.startsWith(".babelrc"))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      if (pkg.babel && typeof pkg.babel === "object") {
        found.push({ source: "package.json#babel", raw: pkg.babel, text: "" });
      }
    } catch {
      // no package.json
    }
  }
  if (found.length === 0) return { source: null, evaluated: false, plugins: [], presets: [] };

  const plugins: BabelPluginEntry[] = [];
  const presets: string[] = [];
  let evaluated = true;
  for (const { raw, text } of found) {
    if (raw && typeof raw === "object") {
      plugins.push(...entriesOf(raw as RawConfig, "plugins").map((p) => entryOf(p, "plugin")));
      presets.push(...entriesOf(raw as RawConfig, "presets").map((p) => entryOf(p, "preset").name));
      continue;
    }
    // Not evaluable: list only the plugins this file names that are known below.
    evaluated = false;
    for (const written of new Set([...text.matchAll(/["'`]([^"'`\s]+)["'`]/g)].map((m) => m[1]))) {
      const name = normalizeBabelName(written);
      if (KNOWN_PLUGINS.some((known) => known.names.includes(name)))
        plugins.push({ written, name });
    }
  }
  return { source: found.map((f) => f.source).join(" + "), evaluated, plugins, presets };
}

export type BabelPluginVerdict = "required" | "alias" | "unneeded" | "unknown";

interface KnownPlugin {
  names: string[];
  verdict: BabelPluginVerdict;
  reason: (entry: BabelPluginEntry, active: readonly PresetName[]) => string;
}

/** Why a worklet plugin is not needed — only when the preset replacing its library is active. */
function workletReason(pkg: string, active: readonly PresetName[], root: string): string | null {
  const preset = presetShadowing(pkg);
  if (preset && active.includes(preset)) {
    const detectedBy = Object.entries(AUTO_DETECT_PRESETS)
      .filter(([, name]) => name === preset)
      .map(([detect]) => detect);
    return (
      `transforms worklets for ${pkg}; the active ${preset} preset (auto-detected from ` +
      `${detectedBy.join(", ")}) replaces ${pkg} with a mock, so no worklet runs.`
    );
  }
  if (!installedManifest(root, pkg))
    return `transforms worklets for ${pkg}, which is not installed.`;
  return null;
}

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
      const reason = workletReason(worklets[1], active, root);
      return reason
        ? { ...entry, verdict: "unneeded", reason }
        : { ...entry, verdict: "unknown", reason: unknownReason(entry) };
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

/** The installed major version of `vite`, or null. */
export function viteMajor(root: string): number | null {
  return installedMajor(root, "vite");
}

/** Whether `name` is installed where the project resolves it. */
export function installed(root: string, name: string): boolean {
  return installedManifest(root, name) !== null;
}

/** The plugins array as config source text. */
export function pluginListSource(plugins: BabelPluginEntry[]): string {
  return `[${plugins
    .map((p) =>
      p.options === undefined
        ? JSON.stringify(p.written)
        : `[${JSON.stringify(p.written)}, ${JSON.stringify(p.options)}]`,
    )
    .join(", ")}]`;
}

/**
 * How to run Babel plugins per Vite major. @vitejs/plugin-react 6 (Vite 8) dropped
 * Babel and points at @rolldown/plugin-babel; on Vite 7 and earlier its `babel`
 * option adds plugins.
 */
export function babelRecipe(major: number | null, plugins: BabelPluginEntry[]): string {
  const list = pluginListSource(plugins);
  if (major !== null && major < 8) {
    return (
      `install @vitejs/plugin-react and @babel/core, then add ` +
      `\`react({ babel: { plugins: ${list} } })\` (import react from '@vitejs/plugin-react') to plugins`
    );
  }
  return (
    `install @rolldown/plugin-babel and @babel/core, then add ` +
    `\`babel({ plugins: ${list} })\` (import babel from '@rolldown/plugin-babel') to plugins`
  );
}

/** Whether a plugin's options are plain data (JSON.stringify drops functions silently). */
export function serializableOptions(entry: BabelPluginEntry): boolean {
  const plain = (value: unknown): boolean => {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
    if (Array.isArray(value)) return value.every(plain);
    if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.values(value as object).every(plain);
    }
    return false;
  };
  return entry.options === undefined || plain(entry.options);
}
