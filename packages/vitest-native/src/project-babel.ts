/**
 * The project's own Babel config for project source Vite compiles (`projectBabel`, #579).
 *
 * Metro and babel-jest compile every project file with the project's Babel config. Vite
 * compiles it with Oxc, which covers TypeScript, JSX and standard syntax but not what a
 * plugin adds: legacy decorators (WatermelonDB models), macros, `react-native-dotenv`'s
 * `@env`, a custom plugin. A file whose config needs such a plugin compiles with Babel
 * instead, with that config, as under Jest. Every other file keeps Oxc.
 *
 * `projectBabelTrigger` is the one rule: the engine routes on it, and `doctor` and
 * `migrate` report from it. An entry it does not know triggers routing (fail-safe).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Rollup } from "vite";
import { classifyBabelPlugins, normalizeBabelName } from "./babel-plugins.js";
import { installedManifest } from "./installed-manifest.js";
import type { PresetName } from "./preset-map.js";

export type ProjectBabelMode = "auto" | "always" | "never";

/** A plugin or preset as the project's Babel config lists it. */
export interface ProjectBabelEntry {
  /** Babel's normalized package name (`@babel/plugin-proposal-decorators`), or a path. */
  name: string;
  kind: "plugin" | "preset";
  options?: unknown;
}

// Presets whose transforms Oxc and the engine already cover, and the option keys that
// change nothing Oxc's output depends on. Any other option (`jsxImportSource`,
// `lazyImports`, `loose`) can change what code means, so it triggers routing.
const COVERED_PRESETS = new Map<string, ReadonlySet<string>>([
  [
    "@react-native/babel-preset",
    new Set([
      "disableImportExportTransform",
      "enableBabelRuntime",
      "unstable_transformProfile",
      "disableStaticViewConfigsCodegen",
      "dev",
      "withDevTools",
    ]),
  ],
  [
    "metro-react-native-babel-preset",
    new Set(["disableImportExportTransform", "enableBabelRuntime"]),
  ],
  [
    "babel-preset-expo",
    new Set([
      "disableImportExportTransform",
      "enableBabelRuntime",
      "unstable_transformProfile",
      "reanimated",
      "worklets",
      "web",
      "native",
    ]),
  ],
  [
    "@babel/preset-typescript",
    new Set(["allowDeclareFields", "onlyRemoveTypeImports", "isTSX", "allExtensions"]),
  ],
  ["@babel/preset-react", new Set(["runtime", "development"])],
  ["@babel/preset-flow", new Set()],
  ["@babel/preset-env", new Set(["targets", "modules", "useBuiltIns", "corejs", "bugfixes"])],
]);

// Standard syntax plugins Oxc compiles (or Node runs) the same way. Decorators are the
// exception: their legacy semantics are Babel's own (see docs/579-project-babel.md).
const STANDARD_PLUGIN = /^@babel\/plugin-(?:transform|syntax|proposal)-/;
const NOT_STANDARD = /decorators/;
// Options that change what a standard plugin's output means.
const SEMANTIC_OPTIONS = ["loose", "spec", "assumptions"];

const hasSemanticOption = (options: unknown): string | null => {
  if (!options || typeof options !== "object") return null;
  return SEMANTIC_OPTIONS.find((key) => (options as Record<string, unknown>)[key]) ?? null;
};

/**
 * Why `entry` needs the project's Babel config to compile project source, or null when
 * Oxc and the engine already do what it does. `active` is the run's active presets, for
 * the worklets plugins: they are needed exactly when Reanimated runs as its own mock.
 */
export function projectBabelTrigger(
  entry: ProjectBabelEntry,
  root: string,
  active: readonly PresetName[],
): string | null {
  if (entry.kind === "preset") {
    const allowed = COVERED_PRESETS.get(entry.name);
    if (!allowed) return `the preset ${entry.name}`;
    const options =
      entry.options && typeof entry.options === "object" ? Object.keys(entry.options) : [];
    const changes = options.find((key) => !allowed.has(key));
    return changes ? `${entry.name}'s \`${changes}\` option` : null;
  }
  if (STANDARD_PLUGIN.test(entry.name) && !NOT_STANDARD.test(entry.name)) {
    const semantic = hasSemanticOption(entry.options);
    return semantic ? `${entry.name}'s \`${semantic}\` option` : null;
  }
  const [classified] = classifyBabelPlugins(
    {
      source: null,
      evaluated: true,
      presets: [],
      lazyImports: [],
      plugins: [{ written: entry.name, name: entry.name, options: entry.options }],
    },
    root,
    active,
  );
  return classified.verdict === "unneeded" || classified.verdict === "alias" ? null : entry.name;
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
      return parts[at + 1].startsWith("@") ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1];
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

// Babel's caller for a file Vite compiles: ES modules stay ES modules (Expo's and
// preset-env's module transforms read it).
const CALLER = {
  name: "vitest-native",
  supportsStaticESM: true,
  supportsDynamicImport: true,
  supportsTopLevelAwait: true,
  supportsExportNamespaceFrom: true,
};

// React Native's preset turns ES modules into CommonJS unless told not to; it does not
// read the caller.
const RN_PRESETS = new Set(["@react-native/babel-preset", "metro-react-native-babel-preset"]);

interface Babel {
  loadPartialConfig(options: object): {
    options: { plugins?: ConfigItem[]; presets?: ConfigItem[]; assumptions?: object };
    hasFilesystemConfig(): boolean;
    config?: string;
    babelrc?: string;
  } | null;
  transformAsync(
    code: string,
    options: object,
  ): Promise<{ code?: string | null; map?: unknown } | null>;
}

export interface ProjectBabel {
  /**
   * What triggers compiling with the project's Babel config for a file at the project
   * root, announced at startup: a cached transform never reaches `load`.
   */
  announceRoot(): void;
  /** A project source file compiled with the project's Babel config, or undefined. */
  load(id: string, chain: LoadChain): Promise<Rollup.LoadResult>;
}

/**
 * The project's Babel route, or null when it has no `@babel/core` or the mode is `never`.
 * `active` is the run's active presets.
 */
export function createProjectBabel(
  root: string,
  mode: ProjectBabelMode,
  active: readonly PresetName[],
  announce: (reasons: string[]) => void = () => {},
): ProjectBabel | null {
  if (mode === "never") return null;
  // The project's own @babel/core, as babel-jest uses it; none, nothing to compile with.
  if (installedManifest(root, "@babel/core") === null) return null;
  const babel = createRequire(path.join(root, "package.json"))("@babel/core") as Babel;

  const partialFor = (filename: string) =>
    babel.loadPartialConfig({ filename, cwd: root, root, caller: CALLER });

  // Reasons per distinct set of loaded plugins and presets: most files share one.
  const reasonsByKey = new Map<string, string[]>();
  const reasonsOf = (options: {
    plugins?: ConfigItem[];
    presets?: ConfigItem[];
    assumptions?: object;
  }): string[] => {
    const entries: ProjectBabelEntry[] = [
      ...(options.presets ?? []).map((item) => ({
        name: configItemName(item, "preset"),
        kind: "preset" as const,
        options: item.options,
      })),
      ...(options.plugins ?? []).map((item) => ({
        name: configItemName(item, "plugin"),
        kind: "plugin" as const,
        options: item.options,
      })),
    ];
    const key = JSON.stringify([entries, options.assumptions ?? {}], (_, value) =>
      typeof value === "function" ? "[function]" : value,
    );
    let reasons = reasonsByKey.get(key);
    if (!reasons) {
      reasons = entries
        .map((entry) => projectBabelTrigger(entry, root, active))
        .filter((reason): reason is string => reason !== null);
      if (options.assumptions && Object.keys(options.assumptions).length > 0) {
        reasons.push("the config's `assumptions`");
      }
      reasonsByKey.set(key, reasons);
    }
    return reasons;
  };

  const announced = new Set<string>();
  // Only files in the project: a project-wide Babel config applies to any file Babel is
  // asked about, including a linked workspace package's and vitest-native's own.
  const rootPrefix = root.split(path.sep).join("/").replace(/\/?$/, "/");
  const announceOnce = (reasons: string[]) => {
    const fresh = reasons.filter((reason) => !announced.has(reason));
    if (fresh.length === 0) return;
    for (const reason of fresh) announced.add(reason);
    announce(fresh);
  };
  return {
    announceRoot() {
      const partial = partialFor(path.join(root, "index.js"));
      if (!partial?.hasFilesystemConfig()) return;
      announceOnce(mode === "always" ? ["projectBabel: 'always'"] : reasonsOf(partial.options));
    },

    async load(id, chain) {
      if (!isProjectSourceFile(id) || !id.startsWith(rootPrefix)) return undefined;
      if (asking.getStore() === id) return undefined;
      const partial = partialFor(id);
      // Babel ignores the file (`ignore`/`only`), or no project config applies to it.
      if (!partial?.hasFilesystemConfig()) return undefined;
      const code = await fs.promises.readFile(id, "utf8");
      let reasons = mode === "always" ? ["projectBabel: 'always'"] : reasonsOf(partial.options);
      // Flow, which React Native's preset strips and Oxc cannot parse.
      if (reasons.length === 0 && hasFlowPragma(code)) reasons = ["Flow syntax"];
      if (reasons.length === 0) return undefined;
      announceOnce(reasons);
      if (chain) {
        const other = await asking.run(id, () => chain.load(id));
        if (other != null) return other;
      }
      const presets = (partial.options.presets ?? []).map((item) =>
        RN_PRESETS.has(configItemName(item, "preset")) && item.value
          ? [item.value, { ...(item.options as object), disableImportExportTransform: true }]
          : item,
      );
      const result = await babel.transformAsync(code, {
        ...partial.options,
        presets,
        filename: id,
        sourceMaps: true,
        caller: CALLER,
      });
      if (!result?.code) return undefined;
      return { code: result.code, map: result.map as Rollup.SourceMapInput };
    },
  };
}
