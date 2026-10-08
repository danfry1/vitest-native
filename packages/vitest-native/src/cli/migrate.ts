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
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ASSET_EXTS,
  PRESET_MODULES,
  presetShadowing,
  type PresetName,
} from "../preset-map.js";
import { detectEcosystemPackages } from "../native/ecosystem.js";
import { allows, extractAllowlistPackages, type AllowlistEntry } from "./allowlist.js";
import {
  booleanFlag,
  jestMajor,
  loadJestPreset,
  parseJestScript,
  translateDiscovery,
  type JestDiscoveryOptions,
  type JestScriptFlags,
} from "./jest-discovery.js";
import {
  babelRecipe,
  classifyBabelPlugins,
  installed,
  pluginListSource,
  readBabelConfig,
  serializableOptions,
  viteMajor,
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
  ok: boolean;
}

interface JestConfig {
  [key: string]: unknown;
}

function loadConfigFile(
  root: string,
  file: string,
): { source: string; config: JestConfig | null } | null {
  const abs = path.resolve(root, file);
  const name = path.relative(root, abs).split(path.sep).join("/") || file;
  if (!fs.existsSync(abs)) return null;
  if (!/\.(c?js|json)$/.test(abs)) return { source: name, config: null };
  try {
    const req = createRequire(path.join(root, "package.json"));
    const loaded = abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : req(abs);
    const config = (
      loaded && typeof loaded === "object" && "default" in loaded
        ? (loaded as { default: unknown }).default
        : loaded
    ) as JestConfig;
    if (typeof config === "function") return { source: name, config: null };
    return { source: name, config };
  } catch {
    return { source: name, config: null };
  }
}

function loadJestConfig(
  root: string,
  explicit?: string,
): { source: string | null; config: JestConfig | null } {
  // `jest --config <file>` in the test script names the config Jest actually reads.
  if (explicit) {
    const loaded = loadConfigFile(root, explicit);
    if (loaded) return loaded;
  }
  // Jest's own precedence: a jest.config.* file wins over package.json#jest.
  for (const name of ["jest.config.js", "jest.config.cjs", "jest.config.json"]) {
    const loaded = loadConfigFile(root, name);
    if (loaded) return loaded;
  }
  for (const name of ["jest.config.mjs", "jest.config.ts", "jest.config.mts"]) {
    if (fs.existsSync(path.join(root, name))) return { source: name, config: null };
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
 * What the expo preset covers, named from its module list. jest-expo's setup builds
 * a whole Expo runtime; the preset shadows these modules and nothing else.
 */
function expoPresetCoverage(): string {
  return (
    `jest-expo's setup (its Expo runtime and native-module mocks) is not reproduced; the expo ` +
    `preset shadows ${list(PRESET_MODULES.expo)} — other Expo modules load their real ` +
    `JavaScript, so check the tests that use them`
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
  const { source, config } = loadJestConfig(
    root,
    typeof explicitConfig === "string" ? explicitConfig : undefined,
  );
  const automatic: string[] = [];
  const attention: string[] = [];
  const presetCovered: string[] = [];
  const dropped: string[] = [];

  // Suggested-config fragments assembled at the end.
  const testEntries: string[] = [`globals: true`, `environment: 'node'`];
  const setupFiles: string[] = ["jestCompatSetup"];
  // Object-form alias entries (`"key": value`), and RegExp-keyed ones that need
  // Vite's array form ({ find, replacement }).
  const aliasEntries: string[] = [];
  const aliasKeys = new Set<string>();
  const regexAliases: string[] = [];
  const transformPkgs: string[] = [];
  const extraImports: string[] = [];
  const extraPlugins: string[] = [];
  let excludeGlobs: string[] = [];
  let needsUrlImport = false;
  // Options for the reactNative() call, besides `transform`.
  const pluginOptions: string[] = [];
  const jestPreset = typeof config?.preset === "string" ? config.preset : undefined;
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
  const autoInlined = new Set(detectEcosystemPackages(root, [], [], [], active));

  const addAlias = (key: string, value: string) => {
    if (aliasKeys.has(key)) return false;
    aliasKeys.add(key);
    aliasEntries.push(`${JSON.stringify(key)}: ${value}`);
    return true;
  };
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
    const preset = take<string>("preset");
    if (preset === "react-native" || preset === "@react-native/jest-preset") {
      automatic.push(`preset: '${preset}' → replaced by the reactNative() plugin.`);
    } else if (
      preset === "jest-expo" ||
      preset === "jest-expo/ios" ||
      preset === "jest-expo/android"
    ) {
      const android = preset === "jest-expo/android";
      if (android) pluginOptions.push(`platform: 'android'`);
      automatic.push(
        `preset: '${preset}' → replaced by the reactNative() plugin` +
          `${android ? " with platform: 'android'" : ""}.`,
      );
      attention.push(`preset: '${preset}' — ${expoPresetCoverage()}.`);
    } else if (preset === "jest-expo/universal") {
      attention.push(
        `preset: 'jest-expo/universal' runs one Jest project per platform. Define a Vitest project for each ` +
          `native platform (reactNative({ platform: 'ios' }) and reactNative({ platform: 'android' })); ` +
          `its web and node projects are not React Native renders and stay outside vitest-native.`,
      );
    } else if (preset === "jest-expo/web" || preset === "jest-expo/node") {
      attention.push(
        `preset: '${preset}' targets ${preset.slice("jest-expo/".length)}, not a React Native render; ` +
          `run these suites without vitest-native.`,
      );
    } else if (preset) {
      attention.push(`preset: '${preset}' — unknown preset; review what it configured.`);
    }

    // The preset's own discovery settings (testMatch & co.) sit under the user's.
    let presetConfig: JestDiscoveryOptions | null = null;
    if (preset) {
      const loaded = loadJestPreset(root, preset);
      if ("config" in loaded) {
        presetConfig = loaded.config;
      } else {
        attention.push(
          `preset: '${preset}' could not be loaded (${loaded.error}), so its testMatch/testPathIgnorePatterns ` +
            `could not be read; test.include falls back to Jest's defaults — compare with the preset.`,
        );
      }
    }

    // setup files
    for (const key of ["setupFiles", "setupFilesAfterEnv"]) {
      const files = take<string[]>(key);
      if (!files?.length) continue;
      for (const f of files) {
        if (/react-native\/jest\/setup/.test(f)) {
          presetCovered.push(`${key}: '${f}' — the plugin injects its own setup; delete.`);
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
            regexAliases.push(`{ find: ${regexLiteral(literal)}, replacement: ${replacement} }`);
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
          `scripts.test --ci — Vitest already refuses to write new snapshots when it detects CI.`,
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
        `fakeTimers — configure per-suite with vi.useFakeTimers() (the jest-compat shim covers jest.useFakeTimers()).`,
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
    const discovery = translateDiscovery(discoveryOptions, presetConfig, jestMajor(root));
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
          attention.push(
            `snapshotSerializers — Vitest uses expect.addSnapshotSerializer; vitest-native ships one for RN trees.`,
          );
        } else {
          dropped.push(`${key} — no vitest-native equivalent needed; dropped.`);
        }
      }
    }

    // Jest's default is clearMocks: false; Vitest 5 defaults it to true (Vitest 4: false).
    // Under true, calls a module makes while it loads are cleared before each test, so
    // a test asserting on them fails only after migrating.
    if (config.clearMocks === undefined) {
      testEntries.push(`clearMocks: false`);
      automatic.push(
        `Jest keeps mock calls between tests unless clearMocks is set → test.clearMocks: false ` +
          `(Vitest 5 clears them before each test by default).`,
      );
    }

    for (const key of Object.keys(config)) {
      if (!handled.has(key)) {
        attention.push(`'${key}' — unrecognized Jest key; review manually.`);
      }
    }
  }

  // Manual __mocks__ that a preset replaces: only where a preset actually shadows the
  // module (PRESET_MODULES, checked against the presets by tests/presets.test.ts) and
  // the plugin will detect that preset in this project.
  const mocksDir = path.join(root, "__mocks__");
  if (fs.existsSync(mocksDir)) {
    for (const entry of fs.readdirSync(mocksDir)) {
      const name = entry.replace(/\.(js|cjs|mjs|ts|tsx)$/, "");
      const scoped = fs.statSync(path.join(mocksDir, entry)).isDirectory();
      const candidates = scoped
        ? fs
            .readdirSync(path.join(mocksDir, entry))
            .map((f) => `${name}/${f.replace(/\.(js|cjs|mjs|ts|tsx)$/, "")}`)
        : [name];
      for (const candidate of candidates) {
        const preset = presetShadowing(candidate);
        if (preset && active.includes(preset)) {
          presetCovered.push(
            `__mocks__/${candidate} — the auto-detected ${preset} preset shadows ${candidate}; delete the manual mock.`,
          );
        } else if (installedManifest(root, candidate) && installedTestsItself(root, candidate)) {
          attention.push(
            `__mocks__/${candidate} — ${candidate} ${installedMajor(root, candidate)} runs its own test ` +
              `mode under Vitest, so no preset replaces it, and Vitest applies a root __mocks__ file ` +
              `only through vi.mock; the library's test mode stands in for this mock.`,
          );
        }
      }
    }
  }

  if (navigationOff) {
    pluginOptions.push(`presets: { navigation: false }`);
    automatic.push(
      `jest-expo renders the real React Navigation → presets: { navigation: false }, so screens keep ` +
        `running in real navigators.`,
    );
  }

  // The project's Babel config ran on every file under babel-jest and does not here.
  const babel = readBabelConfig(root);
  if (babel.source) {
    const classified = classifyBabelPlugins(babel, root, active);
    const required = classified.filter((p) => p.verdict === "required");
    const vite = viteMajor(root);
    if (required.length) {
      // Emitted only when it can be done exactly: Vite 8 with @rolldown/plugin-babel
      // and @babel/core installed, and plugin options that are plain data. Otherwise
      // a config that imports a missing package would not load at all.
      const canEmit =
        vite !== null &&
        vite >= 8 &&
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
          attention.push(`${babel.source}: ${p.reason} Required: ${babelRecipe(vite, required)}.`);
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
    for (const p of classified.filter((c) => c.verdict === "unknown")) {
      attention.push(`${babel.source}: ${p.reason}`);
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
  const aliasSource = regexAliases.length
    ? `[\n      ...Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement })),\n` +
      aliasEntries
        .map((e) => {
          const at = e.indexOf(": ");
          return `      { find: ${e.slice(0, at)}, replacement: ${e.slice(at + 2)} },\n`;
        })
        .join("") +
      regexAliases.map((e) => `      ${e},\n`).join("") +
      `    ]`
    : `{ ${["...jestCompatAliases()", ...aliasEntries].join(", ")} }`;
  const suggestedConfig = `import { ${excludeGlobs.length ? "configDefaults, " : ""}defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'
${needsUrlImport ? "import { fileURLToPath } from 'node:url'\n" : ""}${extraImports.map((i) => `${i}\n`).join("")}
export default defineConfig({
  plugins: [${[transformLine, ...extraPlugins, "jestMockTransform()"].join(", ")}],
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

export function renderMigrationReport(report: MigrationReport): string[] {
  const lines: string[] = [];
  if (!report.source) {
    lines.push(
      "✗ no Jest configuration found (package.json#jest or jest.config.{js,cjs,json}).",
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
  lines.push("Suggested vitest.config:", "");
  lines.push(...report.suggestedConfig.split("\n").map((l) => `  ${l}`));
  lines.push(
    "Re-run with --write to save this config, then: npx vitest-native doctor && npx vitest",
  );
  return lines;
}
