/**
 * The project's own Babel config for project source Vite compiles (`projectBabel`, #579).
 *
 * Metro and babel-jest compile every project file with the project's Babel config. Vite
 * compiles it with Oxc, which covers TypeScript, JSX, Flow-free standard syntax and the
 * React Native presets' own transforms, but not what a plugin adds: legacy decorators
 * (WatermelonDB models), macros, `react-native-dotenv`'s `@env`, worklets when Reanimated
 * runs as its own mock, a custom plugin.
 *
 * The config decides WHICH of its entries matter (classifyProjectBabelEntry); a cheap
 * test of each file's source decides WHETHER the file needs one. Only a file that does
 * compiles with Babel, with the project's config and its module transforms taken out so
 * the output stays an ES module for Vite. An entry this does not know applies to every
 * file, and is named at startup.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Rollup } from "vite";
import {
  classifyBabelPlugins,
  normalizeBabelName,
  reanimatedRunsItsOwnMock,
} from "./babel-plugins.js";
import { installedManifest } from "./installed-manifest.js";
import { projectBabelCaller } from "./native/babel-caller.mjs";
import { VitestNativeError } from "./errors.mjs";
import type { PresetName } from "./preset-map.js";

export type ProjectBabelMode = "auto" | "always" | "never";

/** A plugin or preset as the project's Babel config lists it. */
export interface ProjectBabelEntry {
  /** Babel's normalized package name (`@babel/plugin-proposal-decorators`), or a path. */
  name: string;
  kind: "plugin" | "preset";
  options?: unknown;
}

/**
 * What an entry means for project source under Vite:
 * - `covered`: Oxc and the engine already do it;
 * - `strip`: it would make the output CommonJS or instrument it, so it is taken out;
 * - `needed`: a file compiles with Babel when `applies(source, file)` holds; `applies` null
 *   means every file (an entry this does not know).
 */
export type ProjectBabelClassification =
  | { kind: "covered" }
  | { kind: "strip" }
  | {
      kind: "needed";
      reason: string;
      applies: ((source: string, file: string) => boolean) | null;
      /** An entry this does not know: compiled for every file, with Oxc as the fallback. */
      unknown?: boolean;
      entryKind?: "plugin" | "preset";
    };

const COVERED = { kind: "covered" } as const;
const STRIP = { kind: "strip" } as const;
const needed = (
  reason: string,
  applies: ((source: string, file: string) => boolean) | null,
): ProjectBabelClassification => ({ kind: "needed", reason, applies });
const unknownEntry = (
  reason: string,
  entryKind: "plugin" | "preset",
): ProjectBabelClassification => ({
  kind: "needed",
  reason,
  applies: null,
  unknown: true,
  entryKind,
});

// Source tests: cheap, and over-matching only costs a Babel compile, never a wrong one.
const has = (re: RegExp) => (source: string) => re.test(source);
// Run on the raw source: a decorator or a class mentioned in a comment can route the
// file, which only costs a Babel compile, while missing a real one would compile the file
// without the plugin it needs. Decorators skip the comment positions one line shows.
// `@name` where an expression or declaration can start, wherever it is on the line
// (`export default @observer class`, `@ field() name`), not inside a word (an e-mail
// address), a path (`/@user`) or a string (`'@env'`).
const DECORATOR_AT = /(?:^|[^\w$@./'"`])@\s*[A-Za-z_$][\w$.]*/gm;
/**
 * Whether the line before an `@` puts it in a comment a decorator can never be in: after
 * `//`, on a JSDoc line (` * @param`), or after a `/*` the line does not close. Only that
 * line is read, so nothing that spans lines or strings can hide a real decorator; a tag
 * in a block comment whose lines do not start with `*` still counts (a Babel compile).
 */
function inLineComment(line: string): boolean {
  // Strings on the line first, so a `//` in one (a URL) does not read as a comment.
  const before = line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""');
  if (before.includes("//") || /^\s*\*/.test(before)) return true;
  const open = before.lastIndexOf("/*");
  return open !== -1 && !before.includes("*/", open + 2);
}
const DECORATOR = (source: string): boolean => {
  for (const match of source.matchAll(DECORATOR_AT)) {
    const at = match.index + match[0].indexOf("@");
    const lineStart = source.lastIndexOf("\n", at - 1) + 1;
    if (!inLineComment(source.slice(lineStart, at))) return true;
  }
  return false;
};
// A macro module: `x.macro`, `x.macro.js`, `lib/macro`, `lib/macro/index.js`.
const MACRO_IMPORT = has(/['"][^'"\n]*[./]macro(?:\/index)?(?:\.[cm]?[jt]sx?)?['"]/);
const WORKLET = has(
  /['"]worklet['"]|\buse(?:Animated\w*|DerivedValue|FrameCallback)\b|\brunOn(?:UI|JS|Runtime)\b|\bscheduleOnUI\b|\bGesture\.\w+\(/,
);
// JSX, in a file that can hold it: a `.ts` file cannot, and its generics (`Record<K, V>`)
// would match.
const JSX = (source: string, file: string) => !/\.[cm]?ts$/.test(file) && /<[A-Za-z>]/.test(source);
// A class declaration or expression (generic, extending or implementing): `class`, an
// optional name, then `<`, `extends`, `implements` or `{`.
const CLASS = has(/\bclass\b(?:\s+[A-Za-z_$][\w$]*)?\s*(?:<|extends\b|implements\b|\{)/);
const CONSOLE = has(/\bconsole\s*\./);
const USES_PROCESS_ENVIRONMENT = has(/\bprocess\.env\b/);
const UNISTYLES = has(/react-native-unistyles|from\s+['"]react-native['"]/);
const IMPORTS_TAMAGUI = has(/['"](?:tamagui|@tamagui\/[^'"]+)['"]/);
const IMPORTS_PAPER = has(/['"]react-native-paper(?:\/[^'"]*)?['"]/);
const JS_FILE = (file: string) => /\.[cm]?jsx?$/.test(file);
const importOf = (moduleName: string) => {
  const quoted = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return has(new RegExp(`['"]${quoted}['"]`));
};

// React Native's and Expo's presets: Oxc and the engine already cover them. These option
// keys leave that true; another key can change the output and makes the preset needed.
const RN_PRESET_OPTIONS = new Set([
  "disableImportExportTransform",
  "enableBabelRuntime",
  "unstable_transformProfile",
  "disableStaticViewConfigsCodegen",
  "dev",
  "withDevTools",
  "lazyImportExportTransform",
]);
const EXPO_PRESET_OPTIONS = new Set([
  ...RN_PRESET_OPTIONS,
  "jsxRuntime",
  "lazyImports",
  "react-compiler",
  "reanimated",
  "worklets",
  "minifyTypeofWindow",
  "decorators",
  "web",
  "native",
]);
const PRESET_OPTIONS = new Map<string, ReadonlySet<string>>([
  ["@react-native/babel-preset", RN_PRESET_OPTIONS],
  ["metro-react-native-babel-preset", RN_PRESET_OPTIONS],
  ["babel-preset-expo", EXPO_PRESET_OPTIONS],
  [
    "@babel/preset-typescript",
    new Set([
      "allowDeclareFields",
      "onlyRemoveTypeImports",
      "isTSX",
      "allExtensions",
      "optimizeConstEnums",
      "rewriteImportExtensions",
    ]),
  ],
  ["@babel/preset-react", new Set(["runtime", "development", "useBuiltIns", "useSpread"])],
  ["@babel/preset-flow", new Set()],
  [
    "@babel/preset-env",
    new Set([
      "targets",
      "modules",
      "useBuiltIns",
      "corejs",
      "bugfixes",
      "include",
      "exclude",
      "shippedProposals",
      "debug",
      "browserslistEnv",
      "ignoreBrowserslistConfig",
    ]),
  ],
]);

// Standard syntax Oxc parses and compiles (or Node runs as written): these plugins are
// covered. A plugin for syntax Oxc does not parse is needed where its token appears.
const OXC_SYNTAX = new Set([
  "class-properties",
  "private-methods",
  "private-property-in-object",
  "class-static-block",
  "optional-chaining",
  "nullish-coalescing-operator",
  "logical-assignment-operators",
  "numeric-separator",
  "object-rest-spread",
  "optional-catch-binding",
  "async-generator-functions",
  "async-to-generator",
  "export-namespace-from",
  "arrow-functions",
  "block-scoping",
  "block-scoped-functions",
  "classes",
  "computed-properties",
  "destructuring",
  "duplicate-keys",
  "for-of",
  "function-name",
  "literals",
  "member-expression-literals",
  "parameters",
  "property-literals",
  "shorthand-properties",
  "spread",
  "sticky-regex",
  "template-literals",
  "typeof-symbol",
  "unicode-escapes",
  "unicode-regex",
  "unicode-property-regex",
  "dotall-regex",
  "named-capturing-groups-regex",
  "exponentiation-operator",
  "regenerator",
  "json-strings",
  "new-target",
  "object-super",
  "reserved-words",
  "react-jsx",
  "react-jsx-development",
  "react-display-name",
  "react-jsx-self",
  "react-jsx-source",
  "react-pure-annotations",
  "typescript",
  "flow-strip-types",
  "dynamic-import",
  "jsx",
  "flow",
  "top-level-await",
  "import-meta",
  "class-static-block",
  "import-attributes",
  // Helpers from @babel/runtime instead of inline copies: the same code.
  "runtime",
]);
const UNPARSED_SYNTAX: Record<string, (source: string) => boolean> = {
  "pipeline-operator": has(/\|>/),
  "do-expressions": has(/\bdo\s*\{/),
  "function-bind": has(/::/),
  "export-default-from": has(/\bexport\s+[A-Za-z_$][\w$]*\s*(?:,|\s+from\b)/),
  "throw-expressions": has(/[=(,:?]\s*throw\b/),
  "partial-application": has(/\?\s*[,)]/),
};
// Options that change what a covered plugin's output means.
const SEMANTIC_OPTIONS = [
  "loose",
  "spec",
  "assumptions",
  "pragma",
  "pragmaFrag",
  "importSource",
  "all",
  "jsxPragma",
];
// Taken out: module transforms make CommonJS, which Vite's module runner does not take;
// coverage instrumentation is Vitest's own provider's job.
const STRIPPED = new Set([
  "@babel/plugin-transform-modules-commonjs",
  "@babel/plugin-transform-modules-amd",
  "@babel/plugin-transform-modules-umd",
  "@babel/plugin-transform-modules-systemjs",
  "babel-plugin-dynamic-import-node",
  "babel-plugin-transform-import-meta",
  "babel-plugin-istanbul",
]);

const optionKeys = (options: unknown): string[] =>
  options && typeof options === "object" ? Object.keys(options) : [];
const semanticOption = (options: unknown): string | undefined =>
  optionKeys(options).find((key) => SEMANTIC_OPTIONS.includes(key));

/**
 * What `entry` means for project source under Vite. `active` is the run's active
 * presets: the worklets plugins are needed exactly when Reanimated runs as its own mock.
 */
export function classifyProjectBabelEntry(
  entry: ProjectBabelEntry,
  root: string,
  active: readonly PresetName[],
): ProjectBabelClassification {
  const { name, options } = entry;
  if (entry.kind === "preset") {
    // NativeWind compiles every JSX element through its own runtime.
    if (name === "nativewind/babel") return needed(name, JSX);
    const allowed = PRESET_OPTIONS.get(name);
    if (!allowed) return unknownEntry(`the preset ${name}`, "preset");
    const opts = (options ?? {}) as Record<string, unknown>;
    if (name === "@babel/preset-flow" && opts.all) {
      return needed(`${name}'s \`all\` option`, null);
    }
    // A JSX pragma or import source changes only files with JSX.
    const jsxOption = ["jsxPragma", "jsxPragmaFrag", "pragma", "pragmaFrag", "importSource"].find(
      (key) => opts[key] !== undefined,
    );
    if (jsxOption && (name === "@babel/preset-typescript" || name === "@babel/preset-react")) {
      return needed(`${name}'s \`${jsxOption}\` option`, JSX);
    }
    if (opts.jsxImportSource !== undefined) {
      return needed(`${name}'s \`jsxImportSource\``, JSX);
    }
    const changes = optionKeys(options).find((key) => !allowed.has(key));
    if (changes) return needed(`${name}'s \`${changes}\` option`, null);
    // babel-preset-expo adds the worklets plugin itself unless told not to.
    if (
      name === "babel-preset-expo" &&
      opts.worklets !== false &&
      opts.reanimated !== false &&
      reanimatedRunsItsOwnMock(root, active)
    ) {
      return needed("babel-preset-expo's worklets plugin", WORKLET);
    }
    return COVERED;
  }
  if (STRIPPED.has(name)) return STRIP;
  // React Native's preset's own: its Flow parser and Flow enums, for its own source.
  if (
    name === "babel-plugin-syntax-hermes-parser" ||
    name === "babel-plugin-transform-flow-enums"
  ) {
    return COVERED;
  }
  const standard = /^@babel\/plugin-(?:transform|syntax|proposal)-(.+)$/.exec(name);
  if (standard) {
    const feature = standard[1];
    if (feature === "decorators") return needed(name, DECORATOR);
    const unparsed = UNPARSED_SYNTAX[feature];
    if (unparsed) return needed(name, unparsed);
    if (!OXC_SYNTAX.has(feature)) return needed(name, null);
    const semantic = semanticOption(options);
    if (!semantic) return COVERED;
    const reason = `${name}'s \`${semantic}\` option`;
    if (feature === "class-properties" || feature === "private-methods")
      return needed(reason, CLASS);
    if (feature.startsWith("react-jsx")) return needed(reason, JSX);
    if (feature === "flow-strip-types") return needed(reason, (source) => /:\s*\w/.test(source));
    return needed(reason, null);
  }
  if (name === "react-native-dotenv" || name === "module:react-native-dotenv") {
    const moduleName = (options as { moduleName?: string } | undefined)?.moduleName ?? "@env";
    return needed(name, importOf(moduleName));
  }
  if (/^(?:babel-plugin-)?transform-inline-environment-variables$/.test(name)) {
    return needed(name, USES_PROCESS_ENVIRONMENT);
  }
  if (name === "react-native-unistyles/plugin") return needed(name, UNISTYLES);
  if (name === "babel-plugin-transform-remove-console") return needed(name, CONSOLE);
  if (name === "@tamagui/babel-plugin") return needed(name, IMPORTS_TAMAGUI);
  if (name === "react-native-paper/babel") return needed(name, IMPORTS_PAPER);
  const [classified] = classifyBabelPlugins(
    {
      source: null,
      evaluated: true,
      presets: [],
      lazyImports: [],
      plugins: [{ written: name, name, options }],
    },
    root,
    active,
  );
  if (classified.verdict === "unneeded" || classified.verdict === "alias") return COVERED;
  if (/^react-native-(?:worklets|reanimated)\/plugin$/.test(name)) return needed(name, WORKLET);
  if (classified.verdict === "required") return needed(name, MACRO_IMPORT);
  return unknownEntry(name, "plugin");
}

/**
 * Why the engine applies `entry` to project source (to the files that need it), or null
 * when Oxc and the engine already do what it does or it is taken out. `doctor` and
 * `migrate` report from this.
 */
export function projectBabelTrigger(
  entry: ProjectBabelEntry,
  root: string,
  active: readonly PresetName[],
): string | null {
  const classified = classifyProjectBabelEntry(entry, root, active);
  return classified.kind === "needed" ? classified.reason : null;
}

// Presets whose plugins count as covered when an app's own preset wraps them.
const KNOWN_PRESET_PACKAGES = [
  "@react-native/babel-preset",
  "metro-react-native-babel-preset",
  "babel-preset-expo",
];
// A plugin those presets define inline has no name: Babel keys it by the preset file's
// path plus its place (`…/babel-preset/src/index.js.overrides[5]$1`). Keyed by package and
// place instead, so another copy of the same preset (a monorepo, a nested install) matches.
const PRESET_INLINE_KEY =
  /[\\/](@react-native[\\/]babel-preset|metro-react-native-babel-preset|babel-preset-expo)[\\/].*?\.[cm]?js((?:\.overrides\[\d+\])?(?:\$\d+)*)$/;
/** A resolved plugin's key, the same for every copy of the presets above. */
export function normalizePluginKey(key: string): string {
  const inline = PRESET_INLINE_KEY.exec(key);
  return inline ? `${inline[1].replace(/\\/g, "/")}${inline[2]}` : key;
}
// Plugin keys whose package is not `@babel/plugin-<key>`.
const KEY_PACKAGES: Record<string, string> = {
  "syntax-hermes-parser": "babel-plugin-syntax-hermes-parser",
  "transform-flow-enums": "babel-plugin-transform-flow-enums",
};
/** The package a resolved plugin key names, for classification. */
export function pluginNameOfKey(key: string): string {
  if (KEY_PACKAGES[key]) return KEY_PACKAGES[key];
  return /^(?:transform|syntax|proposal)-/.test(key) ? `@babel/plugin-${key}` : key;
}
const optionsKey = (options: unknown): string =>
  JSON.stringify(options ?? {}, (_, value) => (typeof value === "function" ? "[function]" : value));

/** A Babel ConfigItem, as much of it as this reads. */
interface ConfigItem {
  file?: { request?: string; resolved?: string };
  name?: string;
  options?: unknown;
  value?: unknown;
  dirname?: string;
}

/** The package name of a config item, as `doctor` names it, or its path. */
export function configItemName(item: ConfigItem, kind: "plugin" | "preset"): string {
  const request = item.file?.request;
  if (!request) return item.name ?? `an inline ${kind}`;
  if (request.startsWith("module:")) return request.slice("module:".length);
  if (path.isAbsolute(request)) {
    const parts = request.split(/[\\/]/);
    const at = parts.lastIndexOf("node_modules");
    if (at !== -1 && parts[at + 1]) {
      const scoped = parts[at + 1].startsWith("@");
      const pkg = scoped ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1];
      // The file within the package: its main entry is the package (`lib/index.js`), any
      // other file names a subpath export (`react-native-worklets/plugin`).
      const sub = parts
        .slice(at + (scoped ? 3 : 2))
        .join("/")
        .replace(/(?:^|\/)(?:(?:lib|dist|build|src)\/)?index\.[cm]?js$/, "")
        .replace(/\.[cm]?js$/, "");
      return sub === "" || /^(?:lib|dist|build|src)$/.test(sub) ? pkg : `${pkg}/${sub}`;
    }
    return request;
  }
  if (request.startsWith(".")) return request;
  return normalizeBabelName(request, kind);
}

// A file's leading comments, where its `@flow` pragma is.
const LEADING_COMMENTS = /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*/;
/** Whether a file's leading comments carry `@flow`. */
export const hasFlowPragma = (code: string): boolean =>
  /@flow\b/.test(LEADING_COMMENTS.exec(code)?.[0] ?? "");

const PROJECT_SOURCE = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/;
const NODE_MODULES = /[\\/]node_modules[\\/]/;

/** A project source file this may compile: absolute, no query, outside node_modules. */
export function isProjectSourceFile(id: string): boolean {
  return (
    PROJECT_SOURCE.test(id) && !id.includes("?") && path.isAbsolute(id) && !NODE_MODULES.test(id)
  );
}

/** The plugin container's load (Vite's DevEnvironment), as much as this needs. */
export type LoadChain = { load(id: string): Promise<Rollup.LoadResult> } | undefined;

// See project-jsx.ts: the chain is asked first, and this answers nothing to its own ask.
const asking = new AsyncLocalStorage<string>();

// React Native's and Expo's presets turn ES modules into CommonJS unless told not to.
const ESM_PRESETS = new Set([
  "@react-native/babel-preset",
  "metro-react-native-babel-preset",
  "babel-preset-expo",
]);
// The module transforms, by the alias Babel gives their visitors.
const MODULE_TRANSFORM = /^transform-modules-(?:commonjs|amd|umd|systemjs)$|dynamic-import-node/;
// Output Vite's module runner cannot take, from a plugin the router did not take out.
const COMMONJS_OUTPUT =
  /Object\.defineProperty\(exports,\s*["']__esModule["']|^\s*module\.exports\s*=/m;

interface Babel {
  loadPartialConfig(options: object): {
    options: { plugins?: ConfigItem[]; presets?: ConfigItem[]; assumptions?: object };
    hasFilesystemConfig(): boolean;
  } | null;
  transformAsync(
    code: string,
    options: object,
  ): Promise<{ code?: string | null; map?: unknown } | null>;
  loadOptions(options: object): ({ plugins: { key: string; options?: unknown }[] } & object) | null;
  version?: string;
}

/** One distinct set of loaded plugins and presets, classified once. */
interface Plan {
  needs: {
    reason: string;
    applies: ((source: string, file: string) => boolean) | null;
    unknown?: boolean;
    entryKind?: "plugin" | "preset";
    /** The resolved plugin key of an unknown entry, to name the one that writes CommonJS. */
    key?: string;
  }[];
  presets: unknown[];
  plugins: unknown[];
  /**
   * The unknown plugin found writing CommonJS for this config (by key), once a file
   * showed it: later files decide from it without compiling again.
   */
  commonjsWriter?: string;
}

export interface ProjectBabel {
  /** Names the entries that apply at the project root, once, at startup. */
  announceRoot(): void;
  /** What a file's compiled output depends on beyond its own source (for the cache key). */
  cacheKey(id: string, source?: string): string;
  /** A project source file compiled with the project's Babel config, or undefined. */
  load(id: string, chain: LoadChain): Promise<Rollup.LoadResult>;
}

/**
 * The project's Babel route, or null when it has no `@babel/core` or the mode is `never`.
 * `active` is the run's active presets; `hasExpo` and `platform` choose the caller, the
 * same one Node's require of project source uses (native/babel-caller.mjs).
 */
export function createProjectBabel(
  root: string,
  mode: ProjectBabelMode,
  options: {
    active: readonly PresetName[];
    hasExpo: boolean;
    platform: string;
    /** Called for each file compiled with Babel (the `diagnostics` log). */
    onCompile?: (file: string, reasons: string[]) => void;
  },
  announce: (reasons: string[]) => void = () => {},
): ProjectBabel | null {
  if (mode === "never") return null;
  // The project's own @babel/core, as babel-jest uses it; none, nothing to compile with.
  if (installedManifest(root, "@babel/core") === null) return null;
  const babel = createRequire(path.join(root, "package.json"))("@babel/core") as Babel;
  const caller = projectBabelCaller({
    hasExpo: options.hasExpo,
    platform: options.platform,
    esm: true,
  });
  const partialFor = (filename: string) =>
    babel.loadPartialConfig({ filename, cwd: root, root, caller });

  // The plugins React Native's and Expo's presets expand to, under this caller, by key
  // (normalizePluginKey) with their options: a preset that expands to no others, with the
  // same options, wraps one of them.
  const expand = (presets: unknown[]): { key: string; options: unknown }[] =>
    babel
      .loadOptions({
        filename: path.join(root, "index.js"),
        cwd: root,
        root,
        babelrc: false,
        configFile: false,
        caller,
        presets,
      })
      ?.plugins.map((plugin) => ({
        key: normalizePluginKey(plugin.key),
        options: plugin.options,
      })) ?? [];
  let knownPlugins: Map<string, string> | undefined;
  const knownPresetPlugins = (): Map<string, string> => {
    if (knownPlugins) return knownPlugins;
    knownPlugins = new Map();
    const req = createRequire(path.join(root, "package.json"));
    for (const preset of KNOWN_PRESET_PACKAGES) {
      if (installedManifest(root, preset) === null) continue;
      for (const plugin of expand([req.resolve(preset)])) {
        knownPlugins.set(plugin.key, optionsKey(plugin.options));
      }
    }
    return knownPlugins;
  };
  /**
   * What a preset expands to beyond React Native's and Expo's presets: plugins they do not
   * add, and plugins they add with other options. Null when neither preset is installed.
   */
  const addedByPreset = (item: ConfigItem): { key: string; options: unknown }[] | null => {
    if (!item.value) return null;
    const known = knownPresetPlugins();
    if (known.size === 0) return null;
    return expand([[item.value, item.options ?? {}]]).filter(
      (plugin) => known.get(plugin.key) !== optionsKey(plugin.options),
    );
  };

  /** A config plugin's resolved key, as Babel's loaded options carry it. */
  const keyOfPlugin = (item: ConfigItem): string | undefined => {
    const plugin = babel.loadOptions({
      filename: path.join(root, "index.js"),
      cwd: root,
      root,
      babelrc: false,
      configFile: false,
      caller,
      plugins: [item],
    })?.plugins[0];
    return plugin ? normalizePluginKey(plugin.key) : undefined;
  };

  const plans = new Map<string, Plan>();
  const planOf = (loaded: {
    plugins?: ConfigItem[];
    presets?: ConfigItem[];
    assumptions?: object;
  }): Plan => {
    const presets = loaded.presets ?? [];
    const plugins = loaded.plugins ?? [];
    const key = JSON.stringify(
      [
        presets.map((p) => [configItemName(p, "preset"), p.options]),
        plugins.map((p) => [configItemName(p, "plugin"), p.options]),
        loaded.assumptions ?? {},
      ],
      (_, value) => (typeof value === "function" ? "[function]" : value),
    );
    let plan = plans.get(key);
    if (plan) return plan;
    plan = { needs: [], presets: [], plugins: [] };
    for (const item of presets) {
      const name = configItemName(item, "preset");
      const classified = classifyProjectBabelEntry(
        { name, kind: "preset", options: item.options },
        root,
        options.active,
      );
      // A preset this does not know may only wrap React Native's or Expo's (an app's
      // own preset, @rnx-kit's): what it expands to decides.
      if (classified.kind === "needed") {
        const adds = classified.unknown ? addedByPreset(item) : null;
        if (adds === null) plan.needs.push(classified);
        else {
          // What the preset adds beyond React Native's or Expo's, one plugin at a time: a
          // standard one by its package name, anything else as unknown.
          for (const { key: pluginKey, options: pluginOptions } of adds) {
            const added = classifyProjectBabelEntry(
              { name: pluginNameOfKey(pluginKey), kind: "plugin", options: pluginOptions },
              root,
              options.active,
            );
            if (added.kind !== "needed") continue;
            plan.needs.push(
              added.unknown
                ? {
                    ...classified,
                    reason: `${classified.reason} (adds ${pluginKey})`,
                    key: pluginKey,
                  }
                : { ...added, reason: `${added.reason} (from the preset ${name})` },
            );
          }
        }
      }
      // ES modules out: the RN and Expo presets keep them when told to, preset-env when
      // its module transform is off.
      if (ESM_PRESETS.has(name) && item.value) {
        plan.presets.push([
          item.value,
          { ...(item.options as object), disableImportExportTransform: true },
        ]);
      } else if (name === "@babel/preset-env" && item.value) {
        plan.presets.push([item.value, { ...(item.options as object), modules: false }]);
      } else {
        plan.presets.push(item);
      }
    }
    for (const item of plugins) {
      const name = configItemName(item, "plugin");
      const classified = classifyProjectBabelEntry(
        { name, kind: "plugin", options: item.options },
        root,
        options.active,
      );
      if (classified.kind === "strip") continue;
      if (classified.kind === "needed") {
        plan.needs.push(
          classified.unknown ? { ...classified, key: keyOfPlugin(item) } : classified,
        );
      }
      plan.plugins.push(item);
    }
    if (loaded.assumptions && Object.keys(loaded.assumptions).length > 0) {
      plan.needs.push({ reason: "the config's `assumptions`", applies: null });
    }
    plans.set(key, plan);
    return plan;
  };

  const announced = new Set<string>();
  const fallbackWarned = new Set<string>();
  const announceOnce = (reasons: string[]) => {
    const fresh = reasons.filter((reason) => !announced.has(reason));
    if (fresh.length === 0) return;
    for (const reason of fresh) announced.add(reason);
    announce(fresh);
  };
  // Only files in the project: a project-wide Babel config applies to any file Babel is
  // asked about, including a linked workspace package's and vitest-native's own.
  const rootPrefix = root.split(path.sep).join("/").replace(/\/?$/, "/");
  // A package plugin by its version; a local plugin file by its content, read each time
  // (one small file), so an edit counts however coarse the file system's timestamps are.
  const versionOf = (item: ConfigItem): string => {
    const file = item.file?.resolved;
    if (!file) return "inline";
    if (NODE_MODULES.test(file)) {
      const manifest = installedManifest(root, configItemName(item, "plugin"));
      if (typeof manifest?.version === "string") return manifest.version;
    }
    if (!fs.existsSync(file)) return "missing";
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  };

  return {
    announceRoot() {
      const partial = partialFor(path.join(root, "index.js"));
      if (!partial?.hasFilesystemConfig()) return;
      const plan = planOf(partial.options);
      announceOnce(
        mode === "always" ? ["projectBabel: 'always'"] : plan.needs.map((n) => n.reason),
      );
    },

    cacheKey(id, source) {
      if (!isProjectSourceFile(id) || !id.startsWith(rootPrefix)) return "";
      const partial = partialFor(id);
      if (!partial?.hasFilesystemConfig()) return "";
      const presets = partial.options.presets ?? [];
      const plugins = partial.options.plugins ?? [];
      const names = [
        ...presets.map((item) => configItemName(item, "preset")),
        ...plugins.map((item) => configItemName(item, "plugin")),
      ];
      const dotenv = plugins.find((item) =>
        configItemName(item, "plugin").endsWith("react-native-dotenv"),
      );
      const inlinesEnv = names.some((name) =>
        name.endsWith("transform-inline-environment-variables"),
      );
      return JSON.stringify(
        [
          babel.version,
          [...presets, ...plugins].map((item, i) => [names[i], versionOf(item), item.options]),
          process.env.BABEL_ENV ?? "",
          process.env.NODE_ENV ?? "",
          // What a dotenv plugin inlines: the .env files, and the one its `path` names.
          dotenv ? envFilesHash(root, (dotenv.options as { path?: string } | undefined)?.path) : "",
          // What an inline-environment plugin inlines: only the variables this file reads,
          // so a variable that differs between CI runs does not change every key.
          inlinesEnv && source
            ? [
                ...new Set(
                  [...source.matchAll(/\bprocess\.env\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
                ),
              ]
                .sort()
                .map((name) => [name, process.env[name] ?? null])
            : "",
        ],
        (_, value) => (typeof value === "function" ? "[function]" : value),
      );
    },

    async load(id, chain) {
      if (!isProjectSourceFile(id) || !id.startsWith(rootPrefix)) return undefined;
      if (asking.getStore() === id) return undefined;
      const partial = partialFor(id);
      // Babel ignores the file (`ignore`/`only`), or no project config applies to it.
      if (!partial?.hasFilesystemConfig()) return undefined;
      const plan = planOf(partial.options);
      // Read once: the source tests and the compile use the same text.
      const code = await fs.promises.readFile(id, "utf8");
      let matched: Plan["needs"] = [];
      const reasons =
        mode === "always"
          ? ["projectBabel: 'always'"]
          : (matched = plan.needs.filter(
              (need) => need.applies === null || need.applies(code, id),
            )).map((need) => need.reason);
      // Flow, which React Native's preset strips and Oxc cannot parse.
      if (reasons.length === 0 && JS_FILE(id) && hasFlowPragma(code)) reasons.push("Flow syntax");
      if (reasons.length === 0) return undefined;
      announceOnce(reasons);
      options.onCompile?.(path.relative(root, id).split(path.sep).join("/"), reasons);
      if (chain) {
        const other = await asking.run(id, () => chain.load(id));
        if (other != null) return other;
      }
      const file = path.relative(root, id);
      // This config's CommonJS writer is known and applies to the file: fall back without
      // compiling when it is the file's only need, else fail as the first file did.
      const knownWriter = matched.find((need) => need.unknown && need.key === plan.commonjsWriter);
      if (plan.commonjsWriter && knownWriter) {
        if (matched.length === 1) return undefined;
        throw commonjsError(file, plan.commonjsWriter, knownWriter, matched);
      }
      // The config resolved to plugins (Babel's loadOptions, which transform takes as is),
      // with the module transforms taken out wherever a preset adds them: one that wraps
      // React Native's and does not pass disableImportExportTransform on would otherwise
      // make CommonJS.
      const loaded = babel.loadOptions({
        ...partial.options,
        presets: plan.presets,
        plugins: plan.plugins,
        filename: id,
        sourceMaps: true,
        caller,
      });
      if (!loaded) return undefined;
      const compile = (without?: string) =>
        babel.transformAsync(code, {
          ...loaded,
          plugins: loaded.plugins.filter(
            (plugin) =>
              !MODULE_TRANSFORM.test(plugin.key) && normalizePluginKey(plugin.key) !== without,
          ),
        });
      const result = await compile();
      if (!result?.code) return undefined;
      if (COMMONJS_OUTPUT.test(result.code)) {
        // Which plugin writes it: the unknown one whose absence gives an ES module. Found
        // once per config.
        let emitter: string | undefined;
        for (const plugin of loaded.plugins) {
          const key = normalizePluginKey(plugin.key);
          if (knownPresetPlugins().has(key) || MODULE_TRANSFORM.test(plugin.key)) continue;
          const without = await compile(key);
          if (without?.code && !COMMONJS_OUTPUT.test(without.code)) {
            emitter = key;
            break;
          }
        }
        const emitterNeed = matched.find((need) => need.unknown && need.key === emitter);
        if (emitter && emitterNeed) plan.commonjsWriter = emitter;
        // Oxc, as before projectBabel, only when the CommonJS writer is the one thing that
        // sent the file here: falling back past any other plugin would drop what it does.
        if (emitter && emitterNeed && matched.length === 1) {
          if (!fallbackWarned.has(emitter)) {
            fallbackWarned.add(emitter);
            console.warn(
              `[vitest-native] projectBabel: ${emitterNeed.reason} writes CommonJS, which ` +
                `Vite's module runner cannot run, so files only it applies to (${file} first) ` +
                `compile with Oxc, without it. Leave it out of the config for tests, or set ` +
                `projectBabel: 'never'.`,
            );
          }
          return undefined;
        }
        throw commonjsError(file, emitter, emitterNeed, matched);
      }
      return { code: result.code, map: result.map as Rollup.SourceMapInput };
    },
  };
}

/** PROJECT_BABEL_COMMONJS for `file`, naming the plugin that writes CommonJS if found. */
function commonjsError(
  file: string,
  emitter: string | undefined,
  emitterNeed: { reason: string; entryKind?: "plugin" | "preset" } | undefined,
  matched: { reason: string }[],
): VitestNativeError {
  const what = emitterNeed
    ? `the ${emitterNeed.entryKind ?? "plugin"} ${emitterNeed.reason.replace(/^the preset /, "")}`
    : emitter
      ? `the plugin ${emitter}`
      : "a plugin or preset in it";
  return new VitestNativeError(
    "PROJECT_BABEL_COMMONJS",
    `projectBabel: the project's Babel config compiled ${file} to CommonJS, which Vite's ` +
      `module runner cannot run. vitest-native takes the module transforms it knows out of ` +
      `this compile; ${what} writes CommonJS some other way. The file also needs ` +
      `${matched.map((need) => need.reason).join(", ")}, so it cannot fall back to Oxc ` +
      `without losing what they do. Leave the CommonJS writer out of the config for tests, ` +
      `or set projectBabel: 'never'.`,
  );
}

/**
 * A digest of the project's `.env*` files, and of the file a dotenv plugin's `path`
 * option names, which a dotenv plugin inlines.
 */
function envFilesHash(root: string, configured?: string): string {
  const hash = crypto.createHash("sha1");
  const files = fs
    .readdirSync(root)
    .filter((name) => name.startsWith(".env"))
    .map((name) => path.join(root, name));
  if (configured) files.push(path.resolve(root, configured));
  for (const file of [...new Set(files)].sort()) {
    if (fs.existsSync(file)) hash.update(file).update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}
