/**
 * `vitest-native migrate` — analyze a project's Jest configuration and report,
 * key by key, what maps automatically, what the presets already cover (delete
 * it), and what needs a human. Dry-run by default; --write emits the suggested
 * Vitest config. It never edits test files: `jestMockTransform()` handles
 * top-level `jest.mock` at runtime, so file codemods aren't required to start.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { AUTO_DETECT_PRESETS } from "../preset-map.js";

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

/**
 * Extract package names from Jest's classic transformIgnorePatterns allowlist
 * (`node_modules/(?!(?:pkg1|@scope/pkg2|...)/)`). Best-effort by design: the
 * raw pattern is always surfaced alongside the extraction so nothing is
 * silently lost on exotic regexes.
 */
export function extractAllowlistPackages(pattern: string): string[] {
  const m = /\(\?!([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(pattern);
  if (!m) return [];
  return m[1]
    .split("|")
    .map((entry) =>
      entry
        .replace(/\(\?:/g, "")
        .replace(/[()?*^$]/g, "")
        .replace(/\\\//g, "/")
        .replace(/\/\.$/, "")
        .replace(/\/$/, "")
        .replace(/\.$/, "")
        .trim(),
    )
    .filter((entry) => entry.length > 0 && !entry.includes("\\"));
}

interface JestConfig {
  [key: string]: unknown;
}

function loadJestConfig(root: string): { source: string | null; config: JestConfig | null } {
  const req = createRequire(path.join(root, "package.json"));
  // package.json#jest
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.jest && typeof pkg.jest === "object") {
      return { source: "package.json#jest", config: pkg.jest as JestConfig };
    }
  } catch {
    // no/invalid package.json — fall through to config files
  }
  for (const name of ["jest.config.js", "jest.config.cjs", "jest.config.json"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const loaded = name.endsWith(".json") ? JSON.parse(fs.readFileSync(file, "utf8")) : req(file);
      const config = (
        loaded && typeof loaded === "object" && "default" in loaded
          ? (loaded as { default: unknown }).default
          : loaded
      ) as JestConfig;
      if (typeof config === "function") {
        return { source: name, config: null };
      }
      return { source: name, config };
    } catch {
      return { source: name, config: null };
    }
  }
  for (const name of ["jest.config.mjs", "jest.config.ts", "jest.config.mts"]) {
    if (fs.existsSync(path.join(root, name))) return { source: name, config: null };
  }
  return { source: null, config: null };
}

export function analyzeJestConfig(root: string): MigrationReport {
  const { source, config } = loadJestConfig(root);
  const automatic: string[] = [];
  const attention: string[] = [];
  const presetCovered: string[] = [];
  const dropped: string[] = [];

  // Suggested-config fragments assembled at the end.
  const testEntries: string[] = [`globals: true`, `environment: 'node'`];
  const setupFiles: string[] = ["jestCompatSetup"];
  const aliasEntries: string[] = ["...jestCompatAliases()"];
  const transformPkgs: string[] = [];

  const presetPkgs = new Set(Object.keys(AUTO_DETECT_PRESETS));

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
    } else if (preset === "jest-expo") {
      attention.push(
        `preset: 'jest-expo' → the reactNative() plugin + auto-detected expo preset replace most of it, ` +
          `but suites importing Expo CORE internals can hit known limits (see the migration guide's Expo notes).`,
      );
    } else if (preset) {
      attention.push(`preset: '${preset}' — unknown preset; review what it configured.`);
    }

    // setup files
    for (const key of ["setupFiles", "setupFilesAfterEach", "setupFilesAfterEnv"]) {
      const files = take<string[]>(key);
      if (!files?.length) continue;
      for (const f of files) {
        if (/react-native\/jest\/setup|jest-expo/.test(f)) {
          presetCovered.push(`${key}: '${f}' — the plugin injects its own setup; delete.`);
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
        // An escaped-dot + asset-extension pattern is Jest's classic asset
        // mapper (`\.(png|jpg|...)$`) in any grouping variant.
        if (
          /\\\./.test(pattern) &&
          /\b(png|jpe?g|gif|webp|svg|ttf|otf|woff2?|mp4|mp3)\b/i.test(pattern)
        ) {
          presetCovered.push(`moduleNameMapper '${pattern}' — asset stubbing is built in; delete.`);
        } else if (/^\^?@\/|\^~\/|\^src\//.test(pattern)) {
          const alias = pattern.replace(/[\^$]/g, "").replace(/\(\.\*\)\$?/, "");
          aliasEntries.push(
            `${JSON.stringify(alias.replace(/\/$/, ""))}: ${JSON.stringify(
              String(target)
                .replace("<rootDir>", ".")
                .replace(/\/\$1$/, ""),
            )}`,
          );
          automatic.push(`moduleNameMapper '${pattern}' → resolve.alias.`);
        } else {
          attention.push(
            `moduleNameMapper '${pattern}' → '${String(target)}' — map manually to resolve.alias (regex mappers need rewriting).`,
          );
        }
      }
    }

    // transformIgnorePatterns → transform allowlist
    const tip = take<string[]>("transformIgnorePatterns");
    if (tip?.length) {
      const extracted = tip.flatMap(extractAllowlistPackages);
      if (extracted.length === 0) {
        attention.push(
          `transformIgnorePatterns: ${JSON.stringify(tip)} — could not extract an allowlist automatically; ` +
            `packages shipping untranspiled source go in reactNative({ transform: [...] }).`,
        );
      } else {
        for (const pkg of extracted) {
          if (pkg === "react-native" || pkg.startsWith("@react-native")) {
            automatic.push(
              `transformIgnorePatterns allows '${pkg}' — the native engine transforms RN itself; nothing to do.`,
            );
          } else if (presetPkgs.has(pkg)) {
            presetCovered.push(
              `transformIgnorePatterns allows '${pkg}' — shadowed by the auto-detected preset; nothing to do.`,
            );
          } else {
            transformPkgs.push(pkg);
            automatic.push(
              `transformIgnorePatterns allows '${pkg}' → reactNative({ transform: [...] }).`,
            );
          }
        }
      }
    }

    // timeouts + environment
    const timeout = take<number>("testTimeout");
    if (typeof timeout === "number") {
      testEntries.push(`testTimeout: ${timeout}`);
      automatic.push(`testTimeout: ${timeout} → test.testTimeout.`);
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

    // includes/excludes
    const testMatch = take<string[]>("testMatch");
    if (testMatch?.length) {
      testEntries.push(
        `include: [${testMatch.map((g) => JSON.stringify(g.replace("<rootDir>/", ""))).join(", ")}]`,
      );
      automatic.push(`testMatch → test.include.`);
    }
    const ignore = take<string[]>("testPathIgnorePatterns");
    if (ignore?.length) {
      attention.push(
        `testPathIgnorePatterns: ${JSON.stringify(ignore)} — move to test.exclude (glob syntax, not regex).`,
      );
    }

    // coverage
    const coverageFrom = take<string[]>("collectCoverageFrom");
    if (coverageFrom?.length) {
      automatic.push(`collectCoverageFrom → test.coverage.include (install @vitest/coverage-v8).`);
    }
    take("coveragePathIgnorePatterns");
    take("coverageThreshold");
    if (config.coveragePathIgnorePatterns || config.coverageThreshold) {
      attention.push(`coverage settings — map onto test.coverage.{exclude,thresholds}.`);
    }

    // Known no-ops under vitest-native.
    for (const key of [
      "moduleFileExtensions",
      "maxWorkers",
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
      "roots",
      "testRegex",
      "snapshotSerializers",
      "reporters",
      "modulePathIgnorePatterns",
    ]) {
      if (config[key] !== undefined) {
        handled.add(key);
        if (key === "transform") {
          dropped.push(`transform — Babel/esbuild transforms are the plugin's job; dropped.`);
        } else if (key === "clearMocks" || key === "resetMocks" || key === "restoreMocks") {
          automatic.push(`${key} → test.${key} (same name in Vitest).`);
          testEntries.push(`${key}: ${JSON.stringify(config[key])}`);
        } else if (key === "snapshotSerializers") {
          attention.push(
            `snapshotSerializers — Vitest uses expect.addSnapshotSerializer; vitest-native ships one for RN trees.`,
          );
        } else {
          dropped.push(`${key} — no vitest-native equivalent needed; dropped.`);
        }
      }
    }

    for (const key of Object.keys(config)) {
      if (!handled.has(key)) {
        attention.push(`'${key}' — unrecognized Jest key; review manually.`);
      }
    }
  }

  // Manual __mocks__ that presets replace.
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
        if (presetPkgs.has(candidate)) {
          const preset = (AUTO_DETECT_PRESETS as Record<string, string>)[candidate];
          presetCovered.push(
            `__mocks__/${candidate} — the ${preset} preset covers this; delete the manual mock.`,
          );
        }
      }
    }
  }

  const transformLine = transformPkgs.length
    ? `reactNative({ transform: [${transformPkgs.map((p) => JSON.stringify(p)).join(", ")}] })`
    : `reactNative()`;
  const suggestedConfig = `import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'

export default defineConfig({
  plugins: [${transformLine}, jestMockTransform()],
  resolve: {
    dedupe: ['react', 'react-test-renderer', 'react-is'],
    alias: { ${aliasEntries.join(", ")} },
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
