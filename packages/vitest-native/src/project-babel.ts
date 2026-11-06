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
 * - `needed`: a file compiles with Babel when `applies(source)` holds; `applies` null
 *   means every file (an entry this does not know).
 */
export type ProjectBabelClassification =
  | { kind: "covered" }
  | { kind: "strip" }
  | {
      kind: "needed";
      reason: string;
      applies: ((source: string) => boolean) | null;
      /** An entry this does not know: compiled for every file, with Oxc as the fallback. */
      unknown?: boolean;
      entryKind?: "plugin" | "preset";
    };

const COVERED = { kind: "covered" } as const;
const STRIP = { kind: "strip" } as const;
const needed = (
  reason: string,
  applies: ((source: string) => boolean) | null,
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
// Comments taken out first, so a JSDoc tag or a commented-out word does not count. A `//`
// after a `:` is a URL's, not a comment.
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const inCode = (re: RegExp) => (source: string) => re.test(withoutComments(source));
// `@name` where an expression or declaration can start, wherever it is on the line
// (`export default @observer class`, `@ field() name`), not inside a word (an e-mail
// address), a path (`/@user`) or a string (`'@env'`).
const DECORATOR = inCode(/(?:^|[^\w$@./'"`])@\s*[A-Za-z_$][\w$.]*/m);
// A macro module: `x.macro`, `x.macro.js`, `lib/macro`, `lib/macro/index.js`.
const MACRO_IMPORT = has(/['"][^'"\n]*[./]macro(?:\/index)?(?:\.[cm]?[jt]sx?)?['"]/);
const WORKLET = has(
  /['"]worklet['"]|\buse(?:Animated\w*|DerivedValue|FrameCallback)\b|\brunOn(?:UI|JS|Runtime)\b|\bscheduleOnUI\b|\bGesture\.\w+\(/,
);
const JSX = has(/<[A-Za-z>]/);
// A class declaration or expression (generic, extending or implementing), not the word
// in a comment.
const CLASS = inCode(
  /\bclass\b(?:\s+[A-Za-z_$][\w$]*)?\s*(?:<[^{]*>)?\s*(?:(?:extends|implements)\b[^{]*)?\{/,
);
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
  loadOptions(options: object): { plugins: { key: string }[] } | null;
  version?: string;
}

/** One distinct set of loaded plugins and presets, classified once. */
interface Plan {
  needs: {
    reason: string;
    applies: ((source: string) => boolean) | null;
    unknown?: boolean;
    entryKind?: "plugin" | "preset";
  }[];
  presets: unknown[];
  plugins: unknown[];
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

  // The plugin keys React Native's and Expo's presets expand to, under this caller: a
  // preset that expands to no others wraps one of them.
  const presetKeys = (presets: unknown[]): string[] =>
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
      ?.plugins.map((plugin) => plugin.key) ?? [];
  let knownKeys: Set<string> | undefined;
  const knownPresetKeys = (): Set<string> => {
    if (knownKeys) return knownKeys;
    knownKeys = new Set();
    const req = createRequire(path.join(root, "package.json"));
    for (const preset of ["@react-native/babel-preset", "babel-preset-expo"]) {
      if (installedManifest(root, preset) === null) continue;
      for (const key of presetKeys([req.resolve(preset)])) knownKeys.add(key);
    }
    return knownKeys;
  };
  /** What a preset expands to beyond React Native's and Expo's presets, or null. */
  const addedByPreset = (item: ConfigItem): string[] | null => {
    if (!item.value) return null;
    const known = knownPresetKeys();
    if (known.size === 0) return null;
    return presetKeys([[item.value, item.options ?? {}]]).filter((key) => !known.has(key));
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
          for (const pluginKey of adds) {
            const pluginName = /^(?:transform|syntax|proposal)-/.test(pluginKey)
              ? `@babel/plugin-${pluginKey}`
              : pluginKey;
            const added = classifyProjectBabelEntry(
              { name: pluginName, kind: "plugin" },
              root,
              options.active,
            );
            if (added.kind !== "needed") continue;
            plan.needs.push(
              added.unknown
                ? { ...classified, reason: `${classified.reason} (adds ${pluginKey})` }
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
      if (classified.kind === "needed") plan.needs.push(classified);
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
  const versions = new Map<string, string>();
  // A package plugin by its version; a local plugin file by its content, re-read when it
  // changes (watch mode keeps this process).
  const versionOf = (item: ConfigItem): string => {
    const file = item.file?.resolved;
    if (!file) return "inline";
    if (NODE_MODULES.test(file)) {
      const manifest = installedManifest(root, configItemName(item, "plugin"));
      if (typeof manifest?.version === "string") return manifest.version;
    }
    if (!fs.existsSync(file)) return "missing";
    const stat = fs.statSync(file);
    const memo = `${file}\0${stat.mtimeMs}\0${stat.size}`;
    let version = versions.get(memo);
    if (version === undefined) {
      version = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
      versions.set(memo, version);
    }
    return version;
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
              (need) => need.applies === null || need.applies(code),
            )).map((need) => need.reason);
      // Flow, which React Native's preset strips and Oxc cannot parse.
      if (reasons.length === 0 && JS_FILE(id) && hasFlowPragma(code)) reasons.push("Flow syntax");
      if (reasons.length === 0) return undefined;
      announceOnce(reasons);
      options.onCompile?.(path.relative(root, id), reasons);
      if (chain) {
        const other = await asking.run(id, () => chain.load(id));
        if (other != null) return other;
      }
      const result = await babel.transformAsync(code, {
        ...partial.options,
        presets: plan.presets,
        plugins: plan.plugins,
        filename: id,
        sourceMaps: true,
        caller,
        // A module transform a preset adds itself (one that wraps React Native's and does
        // not pass disableImportExportTransform on) would make CommonJS: its visitors do
        // nothing here, wherever it comes from.
        wrapPluginVisitorMethod: (alias: string, _type: string, visit: unknown) =>
          MODULE_TRANSFORM.test(alias) ? () => {} : visit,
      });
      if (!result?.code) return undefined;
      if (COMMONJS_OUTPUT.test(result.code)) {
        const file = path.relative(root, id);
        // Only entries this does not know sent the file here: Oxc compiled it before, so
        // it keeps doing that, and the run says once which entry it was.
        if (matched.length > 0 && matched.every((need) => need.unknown)) {
          const names = matched.map((need) => need.reason).join(", ");
          if (!fallbackWarned.has(names)) {
            fallbackWarned.add(names);
            console.warn(
              `[vitest-native] projectBabel: ${names} compiled ${file} to CommonJS, which ` +
                `Vite's module runner cannot run, so files it alone applies to compile with ` +
                `Oxc. Leave its module transform out for tests, or set projectBabel: 'never'.`,
            );
          }
          return undefined;
        }
        const culprit = matched.find((need) => need.unknown);
        const what = culprit
          ? `the ${culprit.entryKind ?? "plugin"} ${culprit.reason.replace(/^the preset /, "")}`
          : "a plugin or preset in it";
        throw new VitestNativeError(
          "PROJECT_BABEL_COMMONJS",
          `projectBabel: the project's Babel config compiled ${file} to CommonJS, which Vite's ` +
            `module runner cannot run. vitest-native takes the module transforms it knows out ` +
            `of this compile; ${what} transforms modules some other way. Leave it out for ` +
            `tests, or set projectBabel: 'never'.`,
        );
      }
      return { code: result.code, map: result.map as Rollup.SourceMapInput };
    },
  };
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
