/**
 * The project's own Babel configuration, as `migrate` and `doctor` need to see it.
 *
 * Under Jest every project file goes through babel-jest, which applies the project's
 * babel.config.js. vitest-native does not: project files go through Vite's
 * transform, and React Native's own code through RN's Babel preset — never the
 * project's config (website/guide/how-it-works.md, "Custom Babel plugins don't
 * run"). Most plugins in a React Native Babel config exist for Metro and are not
 * missed, but some change what the code MEANS: a macro plugin replaces
 * `t\`Hello\`` from `@lingui/core/macro` with real calls, and without it the import
 * of the macro package itself fails (`Cannot find module 'babel-plugin-macros'` —
 * 29 test files in the project that surfaced this). That failure named nothing
 * about Babel, and neither command mentioned the config at all.
 *
 * This reads the config, classifies each plugin, and says per plugin what the
 * vitest-native run needs.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { AUTO_DETECT_PRESETS, presetShadowing } from "../preset-map.js";

/** Babel's config files, project-wide first (https://babeljs.io/docs/config-files). */
const BABEL_CONFIG_FILES = [
  "babel.config.js",
  "babel.config.cjs",
  "babel.config.mjs",
  "babel.config.json",
  "babel.config.cts",
  "babel.config.ts",
  ".babelrc",
  ".babelrc.js",
  ".babelrc.cjs",
  ".babelrc.mjs",
  ".babelrc.json",
];

export interface BabelPluginEntry {
  /** As written in the config (`'macros'`, `'module-resolver'`). */
  written: string;
  /** Babel's normalized package name (`babel-plugin-macros`). */
  name: string;
  /** The plugin's options, when given. */
  options?: unknown;
}

export interface BabelConfigReport {
  /** Where the config came from, or null when there is none. */
  source: string | null;
  /** Whether the config was evaluated (true) or only scanned as text. */
  evaluated: boolean;
  plugins: BabelPluginEntry[];
  presets: string[];
}

/**
 * Babel's name normalization for plugins (@babel/core `standardizeName`):
 * `foo` → `babel-plugin-foo`, `@scope/foo` → `@scope/babel-plugin-foo`, `@scope` →
 * `@scope/babel-plugin`, `module:foo` → `foo`; paths and names that already carry
 * the prefix are kept.
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

function entryOf(item: unknown, kind: "plugin" | "preset"): BabelPluginEntry | null {
  const [target, options] = Array.isArray(item) ? item : [item, undefined];
  if (typeof target !== "string") {
    return { written: "<inline plugin>", name: "<inline plugin>", options };
  }
  return { written: target, name: normalizeBabelName(target, kind), options };
}

/**
 * A stand-in for the `api` object Babel passes a function-form config, answering as
 * babel-jest would under Jest: `env()` is 'test' (Jest sets NODE_ENV=test), the
 * caller is babel-jest, and caching calls are accepted and ignored.
 */
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

/** Read the project's Babel config: evaluated when it is CommonJS or JSON, scanned otherwise. */
export function readBabelConfig(root: string): BabelConfigReport {
  const req = createRequire(path.join(root, "package.json"));
  let source: string | null = null;
  let raw: unknown;
  let text = "";
  for (const name of BABEL_CONFIG_FILES) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    source = name;
    text = fs.readFileSync(file, "utf8");
    if (name === ".babelrc" || name.endsWith(".json")) {
      try {
        raw = JSON.parse(text);
      } catch {
        // JSON5 or comments — fall back to the text scan.
      }
    } else if (name.endsWith(".js") || name.endsWith(".cjs")) {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV ??= "test";
      try {
        const loaded = req(file) as unknown;
        const exported =
          loaded && typeof loaded === "object" && "default" in loaded
            ? (loaded as { default: unknown }).default
            : loaded;
        raw =
          typeof exported === "function"
            ? (exported as (api: unknown) => unknown)(babelApi())
            : exported;
      } catch {
        // A config that throws outside Babel is still read as text below.
      } finally {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
      }
    }
    break;
  }
  if (!source) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      if (pkg.babel && typeof pkg.babel === "object") {
        source = "package.json#babel";
        raw = pkg.babel;
      }
    } catch {
      // no package.json
    }
  }
  if (!source) return { source: null, evaluated: false, plugins: [], presets: [] };

  if (raw && typeof raw === "object") {
    const config = raw as {
      plugins?: unknown[];
      presets?: unknown[];
      env?: Record<string, { plugins?: unknown[]; presets?: unknown[] }>;
      overrides?: { plugins?: unknown[]; presets?: unknown[] }[];
    };
    // Babel merges `env[envName]` over the base config, and envName is 'test' under
    // Jest. `overrides` apply per file; their plugins are included so none is missed.
    const sections = [config, config.env?.test ?? {}, ...(config.overrides ?? [])];
    const plugins = sections
      .flatMap((s) => s.plugins ?? [])
      .map((p) => entryOf(p, "plugin"))
      .filter((p): p is BabelPluginEntry => p !== null);
    const presets = sections
      .flatMap((s) => s.presets ?? [])
      .map((p) => entryOf(p, "preset")?.name)
      .filter((p): p is string => typeof p === "string");
    return { source, evaluated: true, plugins, presets };
  }

  // Not evaluable (ESM/TS config, or it threw): report the plugins this file names
  // that the classification below knows, rather than guess at every string in it.
  const plugins: BabelPluginEntry[] = [];
  for (const written of new Set([...text.matchAll(/["'`]([^"'`\s]+)["'`]/g)].map((m) => m[1]))) {
    const name = normalizeBabelName(written);
    if (KNOWN_PLUGINS.some((known) => known.names.includes(name))) {
      plugins.push({ written, name });
    }
  }
  return { source, evaluated: false, plugins, presets: [] };
}

export type BabelPluginVerdict =
  /** Changes what code means; the run is wrong without it. */
  | "required"
  /** Its effect maps onto Vite config (module-resolver → resolve.alias). */
  | "alias"
  /** Not needed under vitest-native, with the reason. */
  | "unneeded"
  /** Not recognized: a human has to judge. */
  | "unknown";

interface KnownPlugin {
  names: string[];
  verdict: BabelPluginVerdict;
  reason: (entry: BabelPluginEntry) => string;
}

/** The library a worklet plugin belongs to, and the preset that shadows it. */
function workletReason(pkg: string): string {
  const preset = presetShadowing(pkg);
  const detectedBy = Object.entries(AUTO_DETECT_PRESETS)
    .filter(([, name]) => name === preset)
    .map(([detect]) => detect);
  return preset
    ? `transforms worklets for ${pkg}'s UI-thread runtime; the ${preset} preset (auto-detected from ` +
        `${detectedBy.join(", ")}) replaces ${pkg} with a mock, so no worklet runs and the transform is not needed.`
    : `transforms worklets for ${pkg}; review whether the suite depends on it.`;
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
  {
    names: ["react-native-worklets/plugin"],
    verdict: "unneeded",
    reason: () => workletReason("react-native-worklets"),
  },
  {
    names: ["react-native-reanimated/plugin"],
    verdict: "unneeded",
    reason: () => workletReason("react-native-reanimated"),
  },
  {
    names: ["babel-plugin-react-compiler"],
    verdict: "unneeded",
    reason: () =>
      `React Compiler only adds memoization to components that follow the Rules of React ` +
      `(react.dev/learn/react-compiler); they render the same without it, so tests do not need it.`,
  },
];

export interface ClassifiedPlugin extends BabelPluginEntry {
  verdict: BabelPluginVerdict;
  reason: string;
}

export function classifyBabelPlugins(report: BabelConfigReport): ClassifiedPlugin[] {
  return report.plugins.map((entry) => {
    const known = KNOWN_PLUGINS.find((k) => k.names.includes(entry.name));
    if (known) return { ...entry, verdict: known.verdict, reason: known.reason(entry) };
    // Any other plugin named for macros is a macro plugin by convention.
    if (/(^|[/-])macros?($|[/-])/.test(entry.name)) {
      return {
        ...entry,
        verdict: "required",
        reason: `${entry.written} looks like a macro plugin; macros are compiled away at build time and fail when imported for real.`,
      };
    }
    return {
      ...entry,
      verdict: "unknown",
      reason: `${entry.written} ran on every file under babel-jest and does not run under vitest-native; check whether tests depend on what it does.`,
    };
  });
}

/** The installed major version of `vite`, or null. */
export function viteMajor(root: string): number | null {
  try {
    const req = createRequire(path.join(root, "package.json"));
    return Number((req("vite/package.json") as { version: string }).version.split(".")[0]);
  } catch {
    return null;
  }
}

export function resolvable(root: string, name: string): boolean {
  try {
    createRequire(path.join(root, "package.json")).resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/** The plugins array as config source text, e.g. `['macros', ['x', {"a":1}]]`. */
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
 * How to run Babel plugins in a Vitest config, per Vite major — a snippet for the
 * report. Vite 8 dropped Babel from @vitejs/plugin-react (v6), which points at
 * @rolldown/plugin-babel; on Vite 7 and earlier, @vitejs/plugin-react's `babel`
 * option is the documented way to add plugins.
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

/** Whether a plugin entry's options survive being written into a config as JSON. */
export function serializableOptions(entry: BabelPluginEntry): boolean {
  // JSON.stringify drops functions and turns RegExps into {} without complaint, so
  // check the shape instead of round-tripping it.
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
