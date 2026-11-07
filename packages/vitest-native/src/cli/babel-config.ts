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
import { installedManifest } from "./manifest.js";
import {
  classifyBabelPlugins,
  isKnownPlugin,
  normalizeBabelName,
  type BabelConfigReport,
  type BabelPluginEntry,
  type BabelPluginVerdict,
  type ClassifiedPlugin,
} from "../babel-plugins.js";

export { classifyBabelPlugins, normalizeBabelName };
export type { BabelConfigReport, BabelPluginEntry, BabelPluginVerdict, ClassifiedPlugin };

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

/** Truthy in the sense Babel's `lazy` option is: `true`, a list of names, or a predicate. */
const enablesLazy = (value: unknown): boolean =>
  value === true || typeof value === "function" || (Array.isArray(value) && value.length > 0);

/** The option bags babel-preset-expo merges for a native platform (its getOptions). */
function expoNativeOptions(options: unknown): Record<string, unknown>[] {
  if (!options || typeof options !== "object") return [];
  const o = options as Record<string, unknown>;
  return [o, o.native, o.ios, o.android].filter(
    (bag): bag is Record<string, unknown> => !!bag && typeof bag === "object",
  );
}

/**
 * Settings that make babel-jest compile `import` into a `require()` run on first use, so a
 * module a test never touches is never evaluated under Jest. Under vitest-native project
 * source is compiled by Vite and its imports are evaluated when the file loads.
 *
 * - babel-preset-expo `lazyImports` (top level or under `native`/`ios`/`android`), passed on as
 * - @react-native/babel-preset `lazyImportExportTransform`, which sets
 * - @babel/plugin-transform-modules-commonjs `lazy`.
 * - An inline-requires plugin (babel-preset-fbjs's, Metro's), which does the same for `require`.
 *
 * With no setting, @react-native/babel-preset makes only a fixed list of React Native's own
 * modules lazy, which tests do not notice, so that is not reported.
 */
export function lazyImportSettings(
  presets: BabelPluginEntry[],
  plugins: BabelPluginEntry[],
): string[] {
  const found: string[] = [];
  for (const preset of presets) {
    if (preset.name === "babel-preset-expo") {
      if (expoNativeOptions(preset.options).some((bag) => enablesLazy(bag.lazyImports))) {
        found.push(`${preset.written} lazyImports`);
      }
    } else if (
      /^(@react-native\/babel-preset|metro-react-native-babel-preset)$/.test(preset.name)
    ) {
      const options = (preset.options ?? {}) as Record<string, unknown>;
      if (enablesLazy(options.lazyImportExportTransform)) {
        found.push(`${preset.written} lazyImportExportTransform`);
      }
    }
  }
  for (const plugin of plugins) {
    if (plugin.name === "@babel/plugin-transform-modules-commonjs") {
      const options = (plugin.options ?? {}) as Record<string, unknown>;
      if (enablesLazy(options.lazy)) found.push(`${plugin.written} lazy`);
    } else if (/inline-requires/.test(plugin.name)) {
      found.push(plugin.written);
    }
  }
  return [...new Set(found)];
}

/** For a config that could only be read as text: the preset options, by name (quoted or not). */
function lazyImportSettingsInText(text: string): string[] {
  const found: string[] = [];
  if (/\blazyImports["']?\s*:\s*(?!(?:false|null|undefined)\b)\S/.test(text))
    found.push("lazyImports");
  if (/\blazyImportExportTransform["']?\s*:\s*(?!(?:false|null|undefined)\b)\S/.test(text)) {
    found.push("lazyImportExportTransform");
  }
  if (/inline-requires/.test(text)) found.push("inline requires");
  return found;
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
  if (found.length === 0) {
    return { source: null, evaluated: false, plugins: [], presets: [], lazyImports: [] };
  }

  const plugins: BabelPluginEntry[] = [];
  const presetEntries: BabelPluginEntry[] = [];
  const lazyInText: string[] = [];
  let evaluated = true;
  for (const { raw, text } of found) {
    if (raw && typeof raw === "object") {
      plugins.push(...entriesOf(raw as RawConfig, "plugins").map((p) => entryOf(p, "plugin")));
      presetEntries.push(
        ...entriesOf(raw as RawConfig, "presets").map((p) => entryOf(p, "preset")),
      );
      continue;
    }
    // Not evaluable: list only the plugins this file names that are known below.
    evaluated = false;
    lazyInText.push(...lazyImportSettingsInText(text));
    for (const written of new Set([...text.matchAll(/["'`]([^"'`\s]+)["'`]/g)].map((m) => m[1]))) {
      const name = normalizeBabelName(written);
      if (isKnownPlugin(name)) plugins.push({ written, name });
    }
  }
  return {
    source: found.map((f) => f.source).join(" + "),
    evaluated,
    plugins,
    presets: presetEntries.map((p) => p.name),
    lazyImports: [...new Set([...lazyImportSettings(presetEntries, plugins), ...lazyInText])],
  };
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
 * How to run Babel plugins: @vitejs/plugin-react 6 (Vite 8) dropped Babel and points at
 * @rolldown/plugin-babel.
 */
export function babelRecipe(plugins: BabelPluginEntry[]): string {
  return (
    `install @rolldown/plugin-babel and @babel/core, then add ` +
    `\`babel({ plugins: ${pluginListSource(plugins)} })\` (import babel from '@rolldown/plugin-babel') to plugins`
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
