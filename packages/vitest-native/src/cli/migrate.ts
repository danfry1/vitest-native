/**
 * `vitest-native migrate` — analyze a project's Jest configuration and report,
 * key by key, what maps automatically, what the presets already cover (delete
 * it), and what needs a human. Dry-run by default; --write emits the suggested
 * Vitest config. It never edits test files: `jestMockTransform()` handles
 * top-level `jest.mock` at runtime, so file codemods aren't required to start.
 *
 * The target is Jest's EFFECTIVE configuration — the config file, the preset under
 * it, Jest's defaults under that, and the flags the `test` script passes on top —
 * so that a migrated project collects the same test files with the same settings
 * without hand edits.
 */
import { createRequire } from "node:module";
import { usesVitePlus } from "../host.js";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ASSET_EXTS,
  LIBRARY_SETUP_FILES,
  presetShadowing,
  type PresetName,
} from "../preset-map.js";
import { detectEcosystemPackages } from "../native/ecosystem.js";
import { allows, extractAllowlistPackages, type AllowlistEntry } from "./allowlist.js";
import { findNodeModuleMocks, ignorePattern } from "../jest-compat/root-mocks.js";
import { HOT_RUNTIME_NOTE } from "./init.js";
import {
  booleanFlag,
  jestMajor,
  parseJestScript,
  projectDirectories,
  translateDiscovery,
  type JestDiscoveryOptions,
  type JestScriptFlags,
} from "./jest-discovery.js";
import { resolveJestPreset, withPresetSettings } from "./jest-preset.js";
import { projectBabelTrigger } from "../project-babel.js";
import { mockFactoryForwardReads } from "./mock-factory-reads.js";
import { libraryResolver, onlyCallsSetUpTests, stripsOnlyReanimatedProps } from "./superseded.js";
import {
  babelRecipe,
  classifyBabelPlugins,
  installed,
  pluginListSource,
  readBabelConfig,
  serializableOptions,
} from "./babel-config.js";
import {
  activePresets,
  installedManifest,
  installedMajor,
  installedTestsItself,
} from "./manifest.js";
import { STAR, tryExpand } from "./regex-subset.js";
import { untranspiledFile } from "./untranspiled.js";

export { extractAllowlistPackages } from "./allowlist.js";

export interface MigrationReport {
  /** Where the Jest config was found, or null. */
  source: string | null;
  /** Keys mapped automatically into the suggested config. */
  automatic: string[];
  /** Findings that need a human decision. */
  attention: string[];
  /** Things the presets already cover — deletable. */
  presetCovered: string[];
  /** Jest keys with no vitest-native relevance (dropped). */
  dropped: string[];
  /** The generated config text. */
  suggestedConfig: string;
  /** The project runs its tests through Vite+ (`vp test`). */
  vitePlus?: boolean;
  ok: boolean;
}

interface JestConfig {
  [key: string]: unknown;
}

/**
 * Jest 30's lookup order for `jest.config.*` (jest-config's JEST_CONFIG_EXT_ORDER; Jest 29's is
 * the same without .mts and .cts). Jest refuses to run when more than one exists, so the order
 * only decides which one migrate reports in that case.
 */
export const JEST_CONFIG_EXTENSIONS = [".js", ".ts", ".mjs", ".mts", ".cjs", ".cts", ".json"];

/** A Jest config file as migrate read it: `config` is null when it could not be loaded. */
interface LoadedConfig {
  source: string;
  config: JestConfig | null;
  /** Why `config` is null, for the report. */
  error?: string;
}

/**
 * Loads a Jest config file the way Node would run it. TypeScript configs (.ts, .mts, .cts)
 * load through Node's own type stripping, which is on by default from Node 22.18 and 23.6;
 * ES module configs (.mjs, .mts, and .js/.ts in a "type": "module" package) through
 * `require()` of ES modules. Jest itself loads a TypeScript config through ts-node and falls
 * back to `import()`, so a config that relies on either (extensionless relative imports,
 * `enum`, path aliases, top-level `await`) is reported with Node's reason rather than guessed at.
 */
function loadConfigFile(root: string, file: string): LoadedConfig | null {
  const abs = path.resolve(root, file);
  const name = path.relative(root, abs).split(path.sep).join("/") || file;
  if (!fs.existsSync(abs)) return null;
  if (!/\.(?:[cm]?[jt]s|json)$/.test(abs)) {
    return { source: name, config: null, error: "not a JavaScript, TypeScript or JSON file" };
  }
  if (/\.[cm]?ts$/.test(abs) && !process.features.typescript) {
    return {
      source: name,
      config: null,
      error: `Node ${process.version} does not load TypeScript by itself; run migrate on Node 22.18 or later`,
    };
  }
  try {
    const req = createRequire(path.join(root, "package.json"));
    const loaded = abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : req(abs);
    const config = (
      loaded && typeof loaded === "object" && "default" in loaded
        ? (loaded as { default: unknown }).default
        : loaded
    ) as JestConfig;
    if (typeof config === "function") {
      return {
        source: name,
        config: null,
        error:
          "it exports a function, which Jest calls to build the config; migrate reads only a config object",
      };
    }
    if (!config || typeof config !== "object") {
      return { source: name, config: null, error: "it does not export a config object" };
    }
    return { source: name, config };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { source: name, config: null, error: message };
  }
}

function loadJestConfig(
  root: string,
  explicit?: string,
): { source: string | null; config: JestConfig | null; error?: string } {
  // `jest --config <file>` in the test script names the config Jest actually reads.
  if (explicit) {
    const loaded = loadConfigFile(root, explicit);
    if (loaded) return loaded;
  }
  // Jest's own precedence: a jest.config.* file wins over package.json#jest.
  for (const extension of JEST_CONFIG_EXTENSIONS) {
    const loaded = loadConfigFile(root, `jest.config${extension}`);
    if (loaded) return loaded;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.jest && typeof pkg.jest === "object") {
      return { source: "package.json#jest", config: pkg.jest as JestConfig };
    }
  } catch {
    // no/invalid package.json
  }
  return { source: null, config: null };
}

function declaredDependencies(root: string): string[] {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return [
      ...new Set(
        ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) =>
          pkg[field] && typeof pkg[field] === "object" ? Object.keys(pkg[field]) : [],
        ),
      ),
    ];
  } catch {
    return [];
  }
}

/** `a, b and c` — for the lists the report prints. */
function list(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * How Expo modules run after migrating. The generated config uses the native engine,
 * where Expo modules run their own JavaScript on native-module mocks, as jest-expo
 * runs them; the expo preset applies to the mock engine only (preset-map's
 * NATIVE_ENGINE_RUNS_PACKAGES).
 */
function expoPresetCoverage(): string {
  return (
    `under the native engine, which the suggested config resolves to wherever React Native's ` +
    `Babel toolchain is installed, Expo modules run their own JavaScript on native-module ` +
    `mocks, as jest-expo runs them: each package's own mocks/ where it ships one, else ` +
    `jest-expo's table of the native modules; check tests that mock an Expo module's ` +
    `native side by hand`
  );
}

/** Escape a literal for a JavaScript regex literal (including `/`). */
function regexLiteral(literal: string): string {
  return `/^${literal.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$/`;
}

/**
 * The literal a `^literal$` moduleNameMapper key matches exactly, or null. An
 * unescaped `.` reads as a literal dot: the regex's extra matches (`lodashXdebounce`)
 * are not specifiers anyone imports.
 */
function exactMapperKey(pattern: string): string | null {
  const m = /^\^(.+)\$$/.exec(pattern);
  const expansions = m ? tryExpand(m[1], true) : null;
  return expansions?.length === 1 && !expansions[0].includes(STAR) ? expansions[0] : null;
}

/**
 * A `^prefix/(.*)$` → `<rootDir>/dir/$1` moduleNameMapper, which is a plain prefix
 * alias: the literal prefix (escapes read as literals, as exactMapperKey reads them)
 * and the project-relative target directory, or null.
 */
function prefixMapper(
  pattern: string,
  target: unknown,
): { key: string; dir: string; rest: string } | null {
  const m = /^\^(.+)\/\((\.\*|\.\+)\)\$?$/.exec(pattern);
  if (!m || typeof target !== "string") return null;
  const expansions = tryExpand(m[1], true);
  if (expansions?.length !== 1 || expansions[0].includes(STAR)) return null;
  const t = /^(<rootDir>|\.)(\/.*)?\/\$1$/.exec(target);
  if (!t || target.indexOf("$") !== target.length - 2) return null;
  return { key: expansions[0], dir: `.${t[2] ?? ""}`, rest: m[2] };
}

/** `pkg` and `/sub` of a bare specifier (scope-aware). */
function splitSpecifier(specifier: string): { pkg: string; subpath: string } {
  const parts = specifier.split("/");
  const pkg = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return { pkg, subpath: specifier.slice(pkg.length) };
}

/** The package a node_modules path belongs to (after the LAST node_modules/), or null. */
function packageOfPath(target: string): string | null {
  const at = target.lastIndexOf("node_modules/");
  return at === -1 ? null : splitSpecifier(target.slice(at + "node_modules/".length)).pkg;
}

/**
 * Whether a package's own `exports` (or main entry, for a bare name) serves
 * `specifier`, so Vite and Node resolve it without help (with the `import` condition
 * Jest's CommonJS resolver lacked).
 */
function packageServes(root: string, specifier: string): boolean {
  const { pkg, subpath } = splitSpecifier(specifier);
  const manifest = installedManifest(root, pkg);
  if (!manifest) return false;
  const exportsField = manifest.exports;
  if (exportsField === undefined) {
    return subpath === "" && (manifest.main !== undefined || manifest.module !== undefined);
  }
  const key = `.${subpath}`;
  if (typeof exportsField === "string" || Array.isArray(exportsField)) return key === ".";
  if (exportsField && typeof exportsField === "object") {
    const keys = Object.keys(exportsField);
    // Conditions-only exports (`{ "import": …, "require": … }`) describe ".".
    if (keys.every((k) => !k.startsWith("."))) return key === ".";
    return key in exportsField;
  }
  return false;
}

export function analyzeJestConfig(root: string): MigrationReport {
  // The test script's flags come first: `--config` decides which config is read.
  let scriptFlags: JestScriptFlags | null = null;
  const otherJestScripts: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command !== "string") continue;
      const parsed = parseJestScript(name, command);
      if (!parsed) continue;
      if (name === "test") scriptFlags = parsed;
      else otherJestScripts.push(name);
    }
  } catch {
    // no/invalid package.json
  }
  const explicitConfig = scriptFlags?.flags.get("config") ?? scriptFlags?.flags.get("c");
  const {
    source,
    config: projectConfig,
    error: configError,
  } = loadJestConfig(root, typeof explicitConfig === "string" ? explicitConfig : undefined);
  const automatic: string[] = [];
  const attention: string[] = [];
  if (source && configError) {
    attention.push(
      `${source} could not be loaded (${configError}), so none of its settings are in the suggested config; carry them over by hand.`,
    );
  }
  const presetCovered: string[] = [];
  const dropped: string[] = [];

  // Suggested-config fragments assembled at the end.
  const testEntries: string[] = [`globals: true`, `environment: 'node'`];
  const setupFiles: string[] = ["jestCompatSetup"];
  // Every alias as an array-form entry ({ find, replacement }), in the order Jest
  // declared it: like moduleNameMapper, Vite's alias list takes the first match, and a
  // string `find: "@"` also takes `@/assets/x`. The object form (`"key": value`) is
  // used only when no entry needs a RegExp `find`.
  const aliasEntries: string[] = [];
  const aliasKeys = new Set<string>();
  const aliasArray: string[] = [];
  let regexAlias = false;
  const addRegexAlias = (entry: string) => {
    aliasArray.push(entry);
    regexAlias = true;
  };
  const transformPkgs: string[] = [];
  const extraImports: string[] = [];
  const extraPlugins: string[] = [];
  let excludeGlobs: string[] = [];
  // Jest's `roots`, relative to the project root, and `modulePathIgnorePatterns`, when
  // the config sets them.
  let jestRoots: string[] | null = null;
  let jestIgnorePatterns: string[] | null = null;
  // The project's directories, walked once and only when something needs them.
  let directories: string[] | undefined;
  let needsUrlImport = false;
  // Options for the reactNative() call, besides `transform`.
  const pluginOptions: string[] = [];
  // The preset's settings sit under the project's, as Jest merges them; a local preset
  // that spreads a known one is translated as that preset (jest-preset.ts).
  const resolvedPreset =
    typeof projectConfig?.preset === "string"
      ? resolveJestPreset(root, projectConfig.preset)
      : undefined;
  const presetKeys = Object.keys(resolvedPreset?.own ?? {});
  const config: JestConfig | null =
    projectConfig && resolvedPreset && presetKeys.length
      ? withPresetSettings(projectConfig, resolvedPreset.own)
      : projectConfig;
  const jestPreset = resolvedPreset?.name;
  const fromJestExpo = /^jest-expo(\/(ios|android|universal))?$/.test(jestPreset ?? "");

  // jest-expo mocks Expo's native modules but not React Navigation, so its suites
  // render real navigators. The navigation preset would mock them, so it is switched
  // off — unless the project mocked React Navigation itself (Jest applied a root
  // __mocks__/@react-navigation automatically; the preset is that mock's equivalent).
  const navigationOff =
    fromJestExpo &&
    activePresets(root).includes("navigation") &&
    !fs.existsSync(path.join(root, "__mocks__", "@react-navigation"));
  // The presets the generated config's run enables — decided as the plugin decides
  // (installed, not testing itself, not switched off) — and the packages the engine
  // detects and compiles by itself under them. A `transform` entry for one of those
  // would take precedence over detection and externalize it instead.
  const active: PresetName[] = activePresets(root, navigationOff ? ["navigation"] : []);
  // A preset that steps aside under the native engine for a library that runs as itself
  // with the Jest setup file it ships (LIBRARY_SETUP_FILES).
  const runsWithOwnSetup = (preset: PresetName): boolean =>
    LIBRARY_SETUP_FILES[preset] !== undefined && !active.includes(preset);
  const autoInlined = new Set(detectEcosystemPackages(root, [], [], [], active));

  const addAlias = (key: string, value: string) => {
    if (aliasKeys.has(key)) return false;
    aliasKeys.add(key);
    aliasEntries.push(`${JSON.stringify(key)}: ${value}`);
    aliasArray.push(`{ find: ${JSON.stringify(key)}, replacement: ${value} }`);
    return true;
  };
  // A project file a Jest setting names (`<rootDir>/x`, `./x`, `x`), or null.
  const projectSource = (file: string): string | null => {
    if (/^(?:<rootDir>\/|\.\/)?node_modules\//.test(file)) return null;
    const rel = file.replace(/^<rootDir>\/?/, "");
    const base = path.resolve(root, rel);
    const found = [base, `${base}.js`, `${base}.ts`].find((candidate) =>
      fs.statSync(candidate, { throwIfNoEntry: false })?.isFile(),
    );
    return found === undefined ? null : fs.readFileSync(found, "utf8");
  };
  const reanimatedActive = active.includes("reanimated");
  const absolutePath = (relative: string) => {
    needsUrlImport = true;
    return `fileURLToPath(new URL(${JSON.stringify(relative)}, import.meta.url))`;
  };

  if (config) {
    const handled = new Set<string>();
    const take = <T>(key: string): T | undefined => {
      handled.add(key);
      return config[key] as T | undefined;
    };

    // preset
    take("preset");
    const preset = resolvedPreset?.name;
    const label = resolvedPreset?.label;
    if (preset === "react-native" || preset === "@react-native/jest-preset") {
      automatic.push(`preset: ${label} → replaced by the reactNative() plugin.`);
    } else if (
      preset === "jest-expo" ||
      preset === "jest-expo/ios" ||
      preset === "jest-expo/android"
    ) {
      const android = preset === "jest-expo/android";
      if (android) pluginOptions.push(`platform: 'android'`);
      automatic.push(
        `preset: ${label} → replaced by the reactNative() plugin` +
          `${android ? " with platform: 'android'" : ""}.`,
      );
      attention.push(`preset: ${label} — ${expoPresetCoverage()}.`);
    } else if (preset === "jest-expo/universal") {
      attention.push(
        `preset: ${label} runs one Jest project per platform. Define a Vitest project for each ` +
          `native platform (reactNative({ platform: 'ios' }) and reactNative({ platform: 'android' })); ` +
          `its web and node projects are not React Native renders and stay outside vitest-native.`,
      );
    } else if (preset === "jest-expo/web" || preset === "jest-expo/node") {
      attention.push(
        `preset: ${label} targets ${preset.slice("jest-expo/".length)}, not a React Native render; ` +
          `run these suites without vitest-native.`,
      );
    } else if (preset && resolvedPreset?.loaded) {
      attention.push(
        `preset: ${label} — not a preset vitest-native translates by name; its settings are translated ` +
          `below as Jest applies them, under this config's own. Review what else it did.`,
      );
    } else if (preset) {
      attention.push(`preset: ${label} — unknown preset; review what it configured.`);
    }
    if (presetKeys.length) {
      automatic.push(
        `preset: ${label} also sets ${list(presetKeys)} → each is handled below like this config's own ` +
          `keys, merged with them as Jest merges a preset's.`,
      );
    }

    // The preset's own discovery settings (testMatch & co.) sit under the user's.
    const presetConfig: JestDiscoveryOptions | null = resolvedPreset?.loaded ?? null;
    if (resolvedPreset && !resolvedPreset.loaded) {
      attention.push(
        `preset: ${label} could not be loaded (${resolvedPreset.loadError}), so its testMatch/testPathIgnorePatterns ` +
          `could not be read; test.include falls back to Jest's defaults — compare with the preset.`,
      );
    }

    // setup files
    for (const key of ["setupFiles", "setupFilesAfterEnv"]) {
      const files = take<string[]>(key);
      if (!files?.length) continue;
      for (const f of files) {
        // A library's own test setup (react-native-unistyles/mocks, a jestSetup.js):
        // run under the jest-compat shim, its jest.mock() calls would replace the
        // preset that already shadows the package.
        // As a package request, or by path into node_modules, the form libraries' own
        // docs give (`./node_modules/react-native-gesture-handler/jestSetup.js`).
        const asRequest = f.replace(/^(?:<rootDir>\/|\.\/)?node_modules\//, "");
        const setupPackage = /^(@[^/]+\/[^/]+|[^@./<][^/]*)\//.exec(asRequest)?.[1];
        const setupPreset = setupPackage ? presetShadowing(setupPackage) : undefined;
        if (/react-native\/jest\/setup/.test(f)) {
          presetCovered.push(`${key}: '${f}' — the plugin injects its own setup; delete.`);
        } else if (setupPreset && active.includes(setupPreset)) {
          presetCovered.push(
            `${key}: '${f}' — ${setupPackage}'s own test setup; the auto-detected ${setupPreset} ` +
              `preset shadows ${setupPackage}, and this file's jest.mock() calls would replace it; delete.`,
          );
        } else if (
          setupPreset &&
          runsWithOwnSetup(setupPreset) &&
          // Only the file the engine runs itself; another of the package's files stays.
          asRequest.replace(/\.js$/, "") === LIBRARY_SETUP_FILES[setupPreset]?.replace(/\.js$/, "")
        ) {
          presetCovered.push(
            `${key}: '${f}' — ${setupPackage}'s own test setup, which the native engine runs ` +
              `before the setup files (${LIBRARY_SETUP_FILES[setupPreset]}); delete.`,
          );
        } else if (reanimatedActive && onlyCallsSetUpTests(projectSource(f) ?? "")) {
          presetCovered.push(
            `${key}: '${f}' — only calls Reanimated's setUpTests(), whose matchers cannot see the ` +
              `rendered style here; vitest-native registers toHaveAnimatedStyle and ` +
              `toHaveAnimatedProps itself; delete.`,
          );
        } else if (/jest-expo/.test(f)) {
          attention.push(`${key}: '${f}' — ${expoPresetCoverage()}.`);
        } else if (f.startsWith("<rootDir>")) {
          // Vitest does not substitute Jest's <rootDir>: it resolves the string as
          // written, so emitting it verbatim produced a config where every test file
          // failed with "Cannot find module .../<rootDir>/jest.setup.js" — while the
          // report called the mapping automatic. Rewritten as an absolute path, like
          // the moduleNameMapper aliases below.
          setupFiles.push(absolutePath(f.replace(/^<rootDir>\/?/, "./")));
          automatic.push(
            `${key}: '${f}' → test.setupFiles (its jest.* calls run under the jest-compat shim).`,
          );
        } else {
          setupFiles.push(JSON.stringify(f));
          automatic.push(
            `${key}: '${f}' → test.setupFiles (its jest.* calls run under the jest-compat shim).`,
          );
        }
      }
    }

    // moduleNameMapper
    const mapper = take<Record<string, unknown>>("moduleNameMapper");
    if (mapper) {
      for (const [pattern, target] of Object.entries(mapper)) {
        // An escaped-dot + extension-group pattern is Jest's classic asset mapper
        // (`\.(png|jpg|...)$`). Covered only for the extensions the plugin handles
        // itself (DEFAULT_ASSET_EXTS, the list plugin.ts uses), and said per extension.
        const assetGroup = /\\\.\(\??:?([a-z0-9|]+)\)\$?$/i.exec(pattern);
        const literal = exactMapperKey(pattern);
        // `@/`, `~/` and `src/` keep the string alias below: nothing imports them bare.
        const prefix = assetGroup ? null : prefixMapper(pattern, target);
        const plainPrefix = prefix && !["@", "~", "src"].includes(prefix.key) ? prefix : null;
        if (assetGroup) {
          const exts = assetGroup[1].toLowerCase().split("|");
          const missing = exts.filter((e) => !DEFAULT_ASSET_EXTS.includes(e));
          if (missing.length === 0) {
            presetCovered.push(
              `moduleNameMapper '${pattern}' — the plugin handles ${list(exts)} imports itself; delete.`,
            );
          } else {
            pluginOptions.push(`assetExts: ${JSON.stringify(missing)}`);
            automatic.push(
              `moduleNameMapper '${pattern}' — ${list(missing)} ${missing.length === 1 ? "is" : "are"} not among ` +
                `the extensions the plugin handles by default → reactNative({ assetExts: ${JSON.stringify(missing)} }).`,
            );
          }
        } else if (plainPrefix) {
          // A RegExp `find` anchored as Jest's pattern is: a string key would also take
          // the bare specifier (`utils` for `^utils/(.*)$`), which Jest leaves to the
          // package. The directory is absolute: Vite resolves a substituted alias
          // relative to the importer.
          const find = `${regexLiteral(plainPrefix.key).slice(0, -2)}\\/(${plainPrefix.rest})$/`;
          addRegexAlias(`{ find: ${find}, replacement: ${absolutePath(plainPrefix.dir)} + "/$1" }`);
          automatic.push(
            `moduleNameMapper '${pattern}' → resolve.alias { find: ${find} } (absolute path).`,
          );
        } else if (/^\^?@\/|\^~\/|\^src\//.test(pattern)) {
          const aliasKey = pattern
            .replace(/[\^$]/g, "")
            .replace(/\((\.\*|\.\+)\)\$?$/, "")
            .replace(/\/$/, "");
          const aliasTarget = String(target)
            .replace(/^<rootDir>\/?/, "./")
            .replace(/\/\$1$/, "")
            .replace(/\/$/, "");
          // Residual regex syntax after the strip means this mapper is more
          // than a plain prefix alias — don't emit something half-right.
          if (/[(){}?+*\\[\]]/.test(aliasKey) || /[(){}?+*\\[\]$]/.test(aliasTarget)) {
            attention.push(
              `moduleNameMapper '${pattern}' → '${String(target)}' — map manually to resolve.alias (regex mappers need rewriting).`,
            );
          } else {
            // Vite resolves string-substituted aliases relative to the IMPORTER,
            // so filesystem aliases must be emitted as absolute paths.
            addAlias(aliasKey, absolutePath(aliasTarget));
            automatic.push(`moduleNameMapper '${pattern}' → resolve.alias (absolute path).`);
          }
        } else if (literal !== null && typeof target === "string" && !target.includes("$")) {
          // An anchored literal maps exactly one specifier. Vite's string `find`
          // matches a prefix (`x` also takes `x/sub`), so the exact match needs a
          // RegExp `find` anchored the same way.
          //
          // A target inside the SAME package the key names is a Jest workaround: its
          // CommonJS resolver could not reach the file through the package's
          // `exports`. Vite and Node honour `exports`, so when the package serves the
          // specifier the mapper is dropped. A target in another package
          // (`^lodash$` → lodash-es) is a real redirect and is kept.
          const samePackage = packageOfPath(target) === splitSpecifier(literal).pkg;
          if (samePackage && packageServes(root, literal)) {
            dropped.push(
              `moduleNameMapper '${pattern}' → '${target}' — '${literal}' is served by its package's ` +
                `exports, which Vite and Node resolve (Jest's CommonJS resolver could not); dropped.`,
            );
          } else {
            const replacement = target.startsWith("<rootDir>")
              ? absolutePath(target.replace(/^<rootDir>\/?/, "./"))
              : target.startsWith(".")
                ? absolutePath(target)
                : JSON.stringify(target);
            addRegexAlias(`{ find: ${regexLiteral(literal)}, replacement: ${replacement} }`);
            automatic.push(
              `moduleNameMapper '${pattern}' → resolve.alias { find: ${regexLiteral(literal)} } ` +
                `(anchored: a string find would also catch '${literal}/…').`,
            );
          }
        } else {
          attention.push(
            `moduleNameMapper '${pattern}' → '${String(target)}' — map manually to resolve.alias (regex mappers need rewriting).`,
          );
        }
      }
    }

    // transformIgnorePatterns → what each allowed package needs here
    const tip = take<string[]>("transformIgnorePatterns");
    if (tip?.length) {
      const results = tip.map(extractAllowlistPackages);
      const entries = results.flatMap((r) => r.entries);
      const unparseable = results.flatMap((r) => r.unparseable);
      // The raw pattern is always surfaced so a mis-extraction can't hide.
      automatic.push(`transformIgnorePatterns (raw): ${JSON.stringify(tip)}`);
      for (const entry of unparseable) {
        attention.push(
          `transformIgnorePatterns entry '${entry}' — could not extract package names confidently; ` +
            `expand it by hand into reactNative({ transform: [...] }) if those packages ship untranspiled source.`,
        );
      }
      if (entries.length === 0 && unparseable.length === 0) {
        attention.push(
          `transformIgnorePatterns: ${JSON.stringify(tip)} — could not extract an allowlist automatically; ` +
            `packages shipping untranspiled source go in reactNative({ transform: [...] }).`,
        );
      } else {
        classifyAllowlist(root, entries, active, autoInlined, {
          automatic,
          presetCovered,
          transformPkgs,
        });
      }
    }

    // CLI flags in the test script override the config, as they do in Jest.
    const flag = (...names: string[]) => {
      for (const n of names) {
        const v = scriptFlags?.flags.get(n);
        if (v !== undefined) return v;
      }
      return undefined;
    };

    // timeouts + environment
    const configTimeout = take<number>("testTimeout");
    const flagTimeout = flag("testTimeout");
    const timeout =
      typeof flagTimeout === "string" && /^\d+$/.test(flagTimeout)
        ? Number(flagTimeout)
        : configTimeout;
    if (typeof timeout === "number") {
      testEntries.push(`testTimeout: ${timeout}`);
      automatic.push(
        flagTimeout !== undefined
          ? `scripts.test --testTimeout=${timeout} → test.testTimeout (Jest's CLI flag overrides the config).`
          : `testTimeout: ${timeout} → test.testTimeout.`,
      );
    }
    const workers = flag("maxWorkers", "w") ?? take<string | number>("maxWorkers");
    handled.add("maxWorkers");
    if (workers !== undefined && workers !== true) {
      const value = /^\d+$/.test(String(workers))
        ? Number(workers)
        : JSON.stringify(String(workers));
      testEntries.push(`maxWorkers: ${value}`);
      automatic.push(
        `maxWorkers ${workers} → test.maxWorkers (a count or a percentage, as in Jest).`,
      );
    }
    if (booleanFlag(flag("runInBand", "i")) === true) {
      testEntries.push(`fileParallelism: false`);
      automatic.push(
        `scripts.test --runInBand → test.fileParallelism: false (one file at a time).`,
      );
    }
    const bail = flag("bail") ?? take<number | boolean>("bail");
    if (bail !== undefined && bail !== false) {
      attention.push(
        `bail — Jest stops after N failed test SUITES; Vitest's test.bail counts failed TESTS, so it is ` +
          `not mapped. Add test.bail yourself if early exit matters.`,
      );
    }
    for (const [name, value] of scriptFlags?.flags ?? []) {
      if (
        ["testTimeout", "maxWorkers", "w", "runInBand", "i", "bail", "config", "c"].includes(name)
      ) {
        continue;
      }
      if (name === "forceExit") {
        // Vitest's `exit()` (packages/vitest/src/node/core.ts; in the 5.0.2 build,
        // dist/chunks/index.C-uw7tH9.js:21446) arms a teardownTimeout timer that
        // warns "close timed out" and calls process.exit().
        dropped.push(
          `scripts.test --forceExit — \`vitest run\` exits by itself: if something keeps the process ` +
            `alive after the run it waits test.teardownTimeout, warns, and exits.`,
        );
      } else if (name === "ci") {
        dropped.push(
          // Vitest's `updateSnapshot` is "none" when std-env reports CI and "new" otherwise
          // (resolveConfig); Jest's --ci defaults to ci-info's CI detection the same way.
          `scripts.test --ci — Vitest writes no new snapshots when it detects CI, as Jest's --ci ` +
            `defaults to; set CI=true to get that elsewhere.`,
        );
      } else if (
        (name === "silent" || name === "passWithNoTests") &&
        booleanFlag(value) !== undefined
      ) {
        const on = booleanFlag(value);
        testEntries.push(`${name}: ${on}`);
        automatic.push(
          `scripts.test --${name}=${on} → test.${name}: ${on} (same meaning in Vitest).`,
        );
      } else {
        attention.push(
          `scripts.test passes --${name}${value === true ? "" : `=${value}`} to Jest — no automatic mapping; ` +
            `pass the Vitest equivalent on the vitest command line if it still matters.`,
        );
      }
    }
    if (scriptFlags?.positional.length) {
      attention.push(
        `scripts.test passes test path patterns ${JSON.stringify(scriptFlags.positional)} — pass them to ` +
          `\`vitest run\` as filters.`,
      );
    }
    if (scriptFlags) {
      // Only point at "mapped above" when there were flags to map.
      const mapped = scriptFlags.flags.size > 0 ? " (its flags are mapped above)" : "";
      attention.push(
        `scripts.test runs Jest — point it at \`vitest run\` once the suite passes${mapped}.`,
      );
    }
    if (otherJestScripts.length) {
      attention.push(
        `${otherJestScripts.length === 1 ? "script" : "scripts"} ${list(otherJestScripts)} also ` +
          `${otherJestScripts.length === 1 ? "runs" : "run"} Jest; only scripts.test was read for flags.`,
      );
    }

    const env = take<string>("testEnvironment");
    if (env && env !== "node") {
      attention.push(`testEnvironment: '${env}' — vitest-native suites run under 'node'; review.`);
    } else {
      handled.add("testEnvironment");
    }
    if (take("fakeTimers") !== undefined) {
      attention.push(
        `fakeTimers — not carried over: call jest.useFakeTimers(options) in a beforeEach, which the jest-compat shim translates, or set Vitest's test.fakeTimers. Not at a setup file's top level: RNTL's import drops options set there.`,
      );
    }

    // Which files are tests: testMatch/testRegex/roots, narrowed by the ignore
    // patterns and moduleFileExtensions — the user's, else the preset's, else Jest's.
    const discoveryOptions: JestDiscoveryOptions = {};
    for (const key of [
      "testMatch",
      "testRegex",
      "testPathIgnorePatterns",
      "modulePathIgnorePatterns",
      "moduleFileExtensions",
      "roots",
    ] as const) {
      const value = take<never>(key);
      if (value !== undefined) discoveryOptions[key] = value;
    }
    if (Array.isArray(discoveryOptions.modulePathIgnorePatterns)) {
      jestIgnorePatterns = (discoveryOptions.modulePathIgnorePatterns as unknown[]).filter(
        (p): p is string => typeof p === "string",
      );
    }
    if (Array.isArray(discoveryOptions.roots)) {
      jestRoots = (discoveryOptions.roots as unknown[])
        .filter((r): r is string => typeof r === "string")
        .map((r) => path.posix.normalize(r.replace(/^<rootDir>/, ".")).replace(/\/$/, "") || ".");
    }
    const discovery = translateDiscovery(
      discoveryOptions,
      presetConfig,
      jestMajor(root),
      // Walked only if a `$`-anchored ignore pattern needs it, once.
      () => (directories ??= projectDirectories(root)),
    );
    if (discovery.include) {
      testEntries.push(`include: [${discovery.include.map((g) => JSON.stringify(g)).join(", ")}]`);
    }
    excludeGlobs = discovery.exclude;
    automatic.push(...discovery.automatic);
    attention.push(...discovery.attention);

    // coverage
    const coverageFrom = take<string[]>("collectCoverageFrom");
    if (coverageFrom?.length) {
      testEntries.push(
        `coverage: { include: [${coverageFrom
          .map((g) => JSON.stringify(g.replace(/^<rootDir>\//, "")))
          .join(", ")}] }`,
      );
      automatic.push(`collectCoverageFrom → test.coverage.include (install @vitest/coverage-v8).`);
    }
    take("coveragePathIgnorePatterns");
    take("coverageThreshold");
    if (config.coveragePathIgnorePatterns || config.coverageThreshold) {
      attention.push(`coverage settings — map onto test.coverage.{exclude,thresholds}.`);
    }

    // Known no-ops under vitest-native.
    for (const key of [
      "verbose",
      "clearMocks",
      "resetMocks",
      "restoreMocks",
      "collectCoverage",
      "coverageDirectory",
      "coverageReporters",
      "cacheDirectory",
      "haste",
      "watchPlugins",
      "transform",
      "globals",
      "snapshotSerializers",
      "reporters",
      "watchPathIgnorePatterns",
      "workerIdleMemoryLimit",
    ]) {
      if (config[key] !== undefined) {
        handled.add(key);
        if (key === "transform") {
          dropped.push(`transform — Babel/esbuild transforms are the plugin's job; dropped.`);
        } else if (key === "clearMocks" || key === "resetMocks" || key === "restoreMocks") {
          // Vitest names Jest's resetMocks `mockReset`; an unknown key would be ignored.
          const vitestKey = key === "resetMocks" ? "mockReset" : key;
          automatic.push(
            key === vitestKey
              ? `${key} → test.${key} (same name in Vitest).`
              : `${key} → test.${vitestKey} (Vitest's name for it).`,
          );
          testEntries.push(`${vitestKey}: ${JSON.stringify(config[key])}`);
        } else if (key === "snapshotSerializers") {
          const serializers = Array.isArray(config[key]) ? (config[key] as unknown[]) : [];
          const rest: string[] = [];
          for (const entry of serializers) {
            const code = typeof entry === "string" ? projectSource(entry) : null;
            if (reanimatedActive && code !== null && stripsOnlyReanimatedProps(code)) {
              presetCovered.push(
                `snapshotSerializers '${entry}' — strips the jest* props Reanimated's real components ` +
                  `add under Jest; the Reanimated preset's components add none; delete.`,
              );
            } else {
              rest.push(String(entry));
            }
          }
          if (rest.length || !serializers.length) {
            attention.push(
              `snapshotSerializers${rest.length ? ` ${rest.map((r) => `'${r}'`).join(", ")}` : ""} — ` +
                `Vitest has no such key: register each with expect.addSnapshotSerializer() in a ` +
                `setup file. React trees need none: they print as under Jest.`,
            );
          }
        } else if (key === "watchPathIgnorePatterns") {
          dropped.push(
            `${key} — affects only Jest's watch mode; Vitest's watch mode reruns by the module graph ` +
              `(tune it with server.watch.ignored if needed); dropped.`,
          );
        } else if (key === "workerIdleMemoryLimit") {
          dropped.push(
            `${key} — Vitest recycles workers by memory only in its vm pools (test.vmMemoryLimit), ` +
              `which vitest-native does not use; dropped. Watch memory on the first full run.`,
          );
        } else {
          dropped.push(`${key} — no vitest-native equivalent needed; dropped.`);
        }
      }
    }

    // Jest's default is clearMocks: false; Vitest 5 defaults it to true.
    // Under true, calls a module makes while it loads are cleared before each test, so
    // a test asserting on them fails only after migrating.
    if (config.clearMocks === undefined) {
      testEntries.push(`clearMocks: false`);
      automatic.push(
        `Jest keeps mock calls between tests unless clearMocks is set → test.clearMocks: false ` +
          `(Vitest 5 clears them before each test by default).`,
      );
    }

    // A library's own Jest resolver that the engine applies itself.
    const resolver = typeof config.resolver === "string" ? config.resolver : undefined;
    const resolverLibrary = resolver ? libraryResolver(resolver) : null;
    if (resolverLibrary && (reanimatedActive || active.includes("worklets"))) {
      handled.add("resolver");
      presetCovered.push(
        `resolver: '${resolver}' — ${resolverLibrary}'s own Jest resolver: the native engine applies ` +
          `Reanimated's and Worklets' resolvers itself where their own mocks run, and their presets ` +
          `replace the packages elsewhere; delete.`,
      );
    }

    for (const key of Object.keys(config)) {
      if (!handled.has(key)) {
        attention.push(`'${key}' — unrecognized Jest key; review manually.`);
      }
    }
  }

  // Snapshots Jest wrote of React Native components were recorded against the component
  // stand-ins of React Native's Jest preset: a host named View or Text, with the props as
  // the component was given them. vitest-native renders React Native's own host
  // components (RCTView, RCTText) with the props React Native passes them, so those
  // snapshots differ even where the component renders the same. They are in the same
  // format, so the diff shows exactly that.
  const snapshotFiles = (directories ??= projectDirectories(root))
    .filter((dir) => path.posix.basename(dir) === "__snapshots__")
    .reduce((count, dir) => {
      let names: string[] = [];
      try {
        names = fs.readdirSync(path.join(root, dir));
      } catch {
        names = [];
      }
      return count + names.filter((name) => name.endsWith(".snap")).length;
    }, 0);
  if (snapshotFiles > 0) {
    attention.push(
      `${snapshotFiles} Jest snapshot file${snapshotFiles === 1 ? "" : "s"} (__snapshots__/*.snap) — ` +
        `most entries need one re-record. Vitest names a snapshot inside a describe ` +
        `'group > test 1' where Jest wrote 'group test 1', and a snapshot of React Native ` +
        `components differs: Jest's preset renders stand-ins named View and Text with the props ` +
        `as given, and vitest-native renders React Native's own host components (RCTView, ` +
        `RCTText) with the props React Native passes them. Once the rest of the suite passes, ` +
        `re-record them once with \`vitest -u\` and review the diff. Vitest also rewrites each ` +
        `file's first line to its own header when it runs it.`,
    );
  }

  // Jest's manual mocks of node_modules packages: a file in a __mocks__ folder anywhere
  // under its roots applies with no jest.mock() call. jestMockTransform() applies it the
  // same way (jest-compat/root-mocks.ts) unless the plugin already stands in for the
  // package: a preset shadows it (PRESET_MODULES, checked against the presets by
  // tests/presets.test.ts), or the library runs with its own Jest setup.
  const mockRoots = jestRoots ?? ["."];
  const ignored = (jestIgnorePatterns ?? []).flatMap((pattern) => {
    const regex = ignorePattern(pattern, root);
    return regex ? [regex] : [];
  });
  const manualMocks = findNodeModuleMocks(
    mockRoots.map((r) => path.resolve(root, r)),
    root,
    ignored,
  );
  const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
  // One line per file: `__mocks__/pkg/index` answers both `pkg/index` and `pkg`.
  const byFile = new Map<string, string[]>();
  for (const mock of manualMocks.mocks) {
    byFile.set(mock.file, [...(byFile.get(mock.file) ?? []), mock.spec]);
  }
  for (const [file, specs] of byFile) {
    const shown = relative(file).replace(/\.[^./]+$/, "");
    // The package the file is named for: `pkg`, not `pkg/index`.
    const candidate = specs[specs.length - 1];
    const preset = presetShadowing(candidate);
    const applied =
      `${shown} → applied to ${specs.slice().reverse().join(" and ")} in every test by ` +
      `jestMockTransform(), with no jest.mock() call, as Jest applies it.`;
    if (preset && active.includes(preset)) {
      presetCovered.push(
        `${shown} — the auto-detected ${preset} preset shadows ${candidate}; delete the manual mock.`,
      );
    } else if (preset && runsWithOwnSetup(preset)) {
      presetCovered.push(
        `${shown} — the native engine runs ${candidate} with its own Jest setup ` +
          `(${LIBRARY_SETUP_FILES[preset]}), which replaces its native layer; delete the manual mock.`,
      );
    } else if (installedTestsItself(root, candidate)) {
      automatic.push(
        `${applied} ${candidate} ${installedMajor(root, candidate)} also runs its own test mode ` +
          `under Vitest, which can stand in for this mock.`,
      );
    } else {
      automatic.push(applied);
    }
  }
  for (const duplicate of manualMocks.duplicates) {
    attention.push(
      `duplicate manual mock ${duplicate.name}: ${duplicate.files.map(relative).join(", ")} — ` +
        `Jest warns and uses one; jestMockTransform() uses the last listed. Delete the others.`,
    );
  }
  // Jest's roots and ignore patterns decide which __mocks__ files count.
  const transformOptions = [
    ...(jestRoots && jestRoots.some((r) => r !== ".")
      ? [`roots: [${jestRoots.map((r) => JSON.stringify(r)).join(", ")}]`]
      : []),
    ...(manualMocks.mocks.length > 0 && jestIgnorePatterns?.length
      ? [
          `modulePathIgnorePatterns: [${jestIgnorePatterns.map((p) => JSON.stringify(p)).join(", ")}]`,
        ]
      : []),
  ];
  const transformCall = transformOptions.length
    ? `jestMockTransform({ ${transformOptions.join(", ")} })`
    : "jestMockTransform()";

  if (navigationOff) {
    pluginOptions.push(`presets: { navigation: false }`);
    automatic.push(
      `jest-expo renders the real React Navigation → presets: { navigation: false }, so screens keep ` +
        `running in real navigators.`,
    );
  }

  // The project's Babel config ran on every file under babel-jest and does not here.
  // jest.mock factories that read a module-level const/let/class while they run.
  const factoryReads = mockFactoryForwardReads(root);
  if (factoryReads.length) {
    const shown = factoryReads
      .slice(0, 5)
      .map((r) => `${r.file}:${r.line} (jest.mock('${r.module}') reads ${r.names.join(", ")})`);
    attention.push(
      `${factoryReads.length} jest.mock() ${factoryReads.length === 1 ? "factory reads" : "factories read"} a ` +
        `const, let or class from the test file's module body while it runs: ${shown.join("; ")}` +
        `${factoryReads.length > 5 ? `; and ${factoryReads.length - 5} more` : ""}. Mock factories run before ` +
        `the module body, so when the mocked module is imported at the top of the test file (the usual case) ` +
        `this throws "Cannot access '…' before initialization" under Vitest. Under babel-jest with React ` +
        `Native's preset it read undefined instead, because the preset compiles const to var. Move the value ` +
        `into the factory, or create it with vi.hoisted().`,
    );
  }
  const babel = readBabelConfig(root);
  if (babel.source) {
    const classified = classifyBabelPlugins(babel, root, active);
    // What the engine applies itself to the project source that needs it (projectBabel
    // 'auto', the generated config's default): one mechanism, so nothing is wired twice.
    const engineApplied = new Map<string, string>();
    for (const p of classified) {
      const reason = projectBabelTrigger(
        { name: p.name, kind: "plugin", options: p.options },
        root,
        active,
      );
      if (reason) engineApplied.set(`plugin:${p.name}`, reason);
    }
    for (const p of babel.presetEntries ?? []) {
      const reason = projectBabelTrigger(
        { name: p.name, kind: "preset", options: p.options },
        root,
        active,
      );
      if (reason) engineApplied.set(`preset:${p.name}`, reason);
    }
    // projectBabel runs only where @babel/core resolves from the project (createProjectBabel);
    // without it the engine applies nothing, so say so instead of "nothing to add".
    const babelCore = installed(root, "@babel/core");
    if (engineApplied.size && !babelCore) {
      const names = [...engineApplied.keys()].map((k) => k.slice(k.indexOf(":") + 1));
      attention.push(
        `${babel.source}: ${list(names)} must reach your own source, and the engine applies ` +
          `${names.length === 1 ? "it" : "them"} with your Babel config (projectBabel 'auto'), which needs ` +
          `@babel/core installed in the project. It does not resolve from here (often it came only with ` +
          `babel-jest). Add @babel/core as a devDependency.`,
      );
    }
    for (const [key, reason] of babelCore ? engineApplied : new Map<string, string>()) {
      const [kind, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      automatic.push(
        `${babel.source}: ${kind} ${name} → applied by the engine to the project source that needs it ` +
          `(projectBabel 'auto'; ${reason}); nothing to add.`,
      );
    }
    const byEngine = (p: { name: string }) => engineApplied.has(`plugin:${p.name}`);
    const required = classified.filter((p) => p.verdict === "required" && !byEngine(p));
    if (required.length) {
      // Emitted only when it can be done exactly: @rolldown/plugin-babel and @babel/core
      // installed, and plugin options that are plain data. Otherwise a config that
      // imports a missing package would not load at all.
      const canEmit =
        installed(root, "@rolldown/plugin-babel") &&
        installed(root, "@babel/core") &&
        required.every(serializableOptions);
      if (canEmit) {
        extraImports.push(`import babel from '@rolldown/plugin-babel'`);
        extraPlugins.push(`babel({ plugins: ${pluginListSource(required)} })`);
        for (const p of required) {
          automatic.push(`${babel.source}: ${p.reason} → babel() from @rolldown/plugin-babel.`);
        }
      } else {
        for (const p of required) {
          attention.push(`${babel.source}: ${p.reason} Required: ${babelRecipe(required)}.`);
        }
      }
    }
    for (const p of classified.filter((c) => c.verdict === "alias")) {
      const options = (p.options ?? {}) as {
        alias?: Record<string, unknown>;
        root?: unknown;
        cwd?: unknown;
      };
      // module-resolver's string keys match a specifier exactly or as a `key/`
      // prefix — the same rule as Vite's string `find`. Relative targets resolve
      // against the working directory (the project root under Jest).
      for (const [key, value] of Object.entries(options.alias ?? {})) {
        if (key.startsWith("^") || typeof value !== "string" || options.cwd !== undefined) {
          attention.push(
            `${babel.source}: module-resolver alias '${key}' → ${JSON.stringify(value)} — not a plain path alias; ` +
              `map it to resolve.alias by hand.`,
          );
          continue;
        }
        const replacement = value.startsWith(".") ? absolutePath(value) : JSON.stringify(value);
        if (addAlias(key, replacement)) {
          automatic.push(`${babel.source}: module-resolver alias '${key}' → resolve.alias.`);
        }
      }
      if (options.root !== undefined) {
        attention.push(
          `${babel.source}: module-resolver root ${JSON.stringify(options.root)} — bare imports resolved ` +
            `from those directories need resolve.alias entries by hand.`,
        );
      }
    }
    for (const p of classified.filter((c) => c.verdict === "unneeded")) {
      dropped.push(`${babel.source}: ${p.written} — ${p.reason}`);
    }
    for (const p of classified.filter((c) => c.verdict === "unknown" && !byEngine(c))) {
      attention.push(`${babel.source}: ${p.reason}`);
    }
    if (babel.lazyImports.length) {
      attention.push(
        `${babel.source}: ${babel.lazyImports.join(", ")} — under Jest a package import ran only when the test ` +
          `first used it; here every import runs when its file loads. A module a test never touched is now ` +
          `evaluated, so a partial jest.mock of something it needs can fail (e.g. "requireOptionalNativeModule ` +
          `is not a function"). Give such a mock the rest of the module: ` +
          `jest.mock('x', () => ({ ...jest.requireActual('x'), ... })).`,
      );
    }
    if (!babel.evaluated) {
      attention.push(
        `${babel.source} could not be evaluated, so only plugins recognized by name are listed; ` +
          `review it for others.`,
      );
    }
  }

  if (transformPkgs.length) {
    pluginOptions.unshift(`transform: [${transformPkgs.map((p) => JSON.stringify(p)).join(", ")}]`);
  }
  const transformLine = pluginOptions.length
    ? `reactNative({ ${pluginOptions.join(", ")} })`
    : `reactNative()`;
  if (excludeGlobs.length) {
    testEntries.push(
      `exclude: [...configDefaults.exclude, ${excludeGlobs.map((g) => JSON.stringify(g)).join(", ")}]`,
    );
  }
  // Vite's object form takes string keys only; a RegExp `find` needs the array form.
  const aliasSource = regexAlias
    ? `[\n      ...Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement })),\n` +
      aliasArray.map((e) => `      ${e},\n`).join("") +
      `    ]`
    : `{ ${["...jestCompatAliases()", ...aliasEntries].join(", ")} }`;
  // Under Vite+ the config is vite.config.ts with defineConfig from 'vite-plus', and
  // Vitest's own exports come through vite-plus/test (viteplus.dev/guide/test).
  const vitePlus = usesVitePlus(root);
  const configImports = vitePlus
    ? `import { defineConfig } from 'vite-plus'\n${excludeGlobs.length ? "import { configDefaults } from 'vite-plus/test/config'\n" : ""}`
    : `import { ${excludeGlobs.length ? "configDefaults, " : ""}defineConfig } from 'vitest/config'\n`;
  const suggestedConfig = `${configImports}import { reactNative } from 'vitest-native'
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'
${needsUrlImport ? "import { fileURLToPath } from 'node:url'\n" : ""}${extraImports.map((i) => `${i}\n`).join("")}
export default defineConfig({
  plugins: [${[transformLine, ...extraPlugins, transformCall].join(", ")}],
  resolve: {
    dedupe: ['react', 'react-test-renderer', 'react-is'],
    alias: ${aliasSource},
  },
  test: {
    ${testEntries.join(",\n    ")},
    setupFiles: [${setupFiles.join(", ")}],
  },
})
`;

  return {
    source,
    automatic,
    attention,
    presetCovered,
    dropped,
    suggestedConfig,
    vitePlus,
    ok: source !== null,
  };
}

/**
 * What each package a transformIgnorePatterns allowlist lets through needs here.
 * Jest compiles nothing in node_modules unless allowed, so its allowlists mix React
 * Native source every runner must compile with ES-module packages only Jest's
 * CommonJS runtime cannot load. React Native, active presets and the engine's own
 * detection (native/ecosystem.ts) cover the first kind; Node loads the second. A
 * package goes into `transform: [...]` — which overrides detection — only with
 * evidence: a file under its entry point that Node cannot parse (see untranspiled.ts).
 * Prefix and scope entries are matched against the project's declared dependencies.
 */
function classifyAllowlist(
  root: string,
  entries: AllowlistEntry[],
  active: readonly PresetName[],
  autoInlined: Set<string>,
  out: { automatic: string[]; presetCovered: string[]; transformPkgs: string[] },
): void {
  const candidates = new Set([
    ...declaredDependencies(root),
    ...entries.filter((e) => e.kind === "exact").map((e) => e.name),
  ]);
  const groups = { rn: [] as string[], detected: [] as string[], absent: [] as string[] };
  const shadowed = new Map<string, string[]>();
  for (const pkg of [...candidates].sort()) {
    if (!entries.some((e) => allows(e, pkg))) continue;
    const preset = presetShadowing(pkg);
    if (pkg === "react-native" || pkg.startsWith("@react-native/")) {
      groups.rn.push(pkg);
    } else if (preset && active.includes(preset)) {
      shadowed.set(preset, [...(shadowed.get(preset) ?? []), pkg]);
    } else if (autoInlined.has(pkg)) {
      groups.detected.push(pkg);
    } else if (!installedManifest(root, pkg)) {
      groups.absent.push(pkg);
    } else {
      const evidence = untranspiledFile(root, pkg);
      if (evidence) {
        out.transformPkgs.push(pkg);
        out.automatic.push(
          `transformIgnorePatterns allows '${pkg}', which ships ${evidence} that Node cannot parse → ` +
            `reactNative({ transform: [...] }).`,
        );
      }
    }
  }
  if (groups.rn.length) {
    out.automatic.push(
      `transformIgnorePatterns allows ${list(groups.rn)} — the native engine transforms React Native itself; nothing to do.`,
    );
  }
  for (const [preset, pkgs] of shadowed) {
    out.presetCovered.push(
      `transformIgnorePatterns allows ${list(pkgs)} — shadowed by the auto-detected ${preset} preset; nothing to do.`,
    );
  }
  if (groups.detected.length) {
    out.automatic.push(
      `transformIgnorePatterns allows ${list(groups.detected)} — detected by the engine (React Native ` +
        `ecosystem), which compiles what Node cannot run; nothing to do.`,
    );
  }
  if (groups.absent.length) {
    out.automatic.push(
      `transformIgnorePatterns allows ${list(groups.absent)} — not installed; nothing to do.`,
    );
  }
}

/** The commands to run once the suggested config is saved. */
export function migrationNextStep(report: MigrationReport): string {
  return report.vitePlus
    ? "npx vitest-native doctor && vp test"
    : "npx vitest-native doctor && npx vitest";
}

/**
 * The report `migrate` prints. With `write: true` (`migrate --write`) the config is about to
 * be saved, so the closing line does not ask for a re-run with --write; the CLI prints the
 * next step after the file is written.
 */
export function renderMigrationReport(
  report: MigrationReport,
  { write = false }: { write?: boolean } = {},
): string[] {
  const lines: string[] = [];
  if (!report.source) {
    lines.push(
      "✗ no Jest configuration found (package.json#jest or jest.config.{js,ts,mjs,cjs,mts,cts,json}).",
      "  Starting fresh? Run `vitest-native init` instead.",
    );
    return lines;
  }
  lines.push(`Analyzed ${report.source}`, "");
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`${title}:`);
    for (const i of items) lines.push(`  • ${i}`);
    lines.push("");
  };
  section("Mapped automatically", report.automatic);
  section("Covered by presets — delete", report.presetCovered);
  section("Needs your attention", report.attention);
  section("Dropped (no equivalent needed)", report.dropped);
  lines.push(report.vitePlus ? "Suggested vite.config:" : "Suggested vitest.config:", "");
  lines.push(...report.suggestedConfig.split("\n").map((l) => `  ${l}`));
  if (!write) {
    lines.push(`Re-run with --write to save this config, then: ${migrationNextStep(report)}`, "");
  }
  lines.push(...HOT_RUNTIME_NOTE);
  return lines;
}
