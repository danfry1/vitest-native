/**
 * `migrate` reproducing Jest's EFFECTIVE test set and settings.
 *
 * Measured on a jest-expo app (Expo 57, RN 0.86, `preset: 'jest-expo/ios'`, test
 * script `NODE_ENV=test jest --forceExit --testTimeout=20000 --bail`): Jest ran 105
 * suites; the migrated config collected 213 files, missed 9 of Jest's, and timed
 * out at Vitest's 5000ms default. The causes, each covered here:
 *
 * - the preset's testMatch was dropped (Vitest's default include has no
 *   `__tests__/**\/*test.ts`), and Jest's moduleFileExtensions — which hide
 *   `*.test.mjs` node:test scripts from Jest — were ignored;
 * - modulePathIgnorePatterns were "dropped" though they remove tests from
 *   discovery, and testPathIgnorePatterns were only mentioned;
 * - `--testTimeout` in the test script was never read;
 * - anchored moduleNameMapper keys were reported as regexes to rewrite;
 * - the nested transformIgnorePatterns allowlist parsed to nothing;
 * - the project's Babel plugins (a macro plugin among them) silently stopped running.
 *
 * The glob conversions are checked DIFFERENTIALLY: Jest's side is modelled the way
 * Jest decides (picomatch with dot:true against the absolute path for testMatch, an
 * unanchored RegExp against the absolute path for the ignore patterns, the last
 * extension against moduleFileExtensions), Vitest's side is the glob library Vitest
 * itself uses (tinyglobby, dot:true, ignore = exclude) run over a real directory.
 * The last test runs the generated config with Vitest.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import { analyzeJestConfig, extractAllowlistPackages } from "../src/cli/migrate.js";
import {
  extensionExclude,
  ignorePatternToGlobs,
  parseJestScript,
  translateDiscovery,
} from "../src/cli/jest-discovery.js";
import { classifyBabelPlugins, readBabelConfig } from "../src/cli/babel-config.js";
import { runDoctor } from "../src/cli/doctor.js";
import { DEFAULT_ASSET_EXTS, PRESET_MODULES } from "../src/preset-map.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The glob library Vitest collects test files with, and the matcher Jest uses —
// both resolved from Vitest itself, so this measures what a run actually does.
const fromVitest = createRequire(createRequire(import.meta.url).resolve("vitest/package.json"));
const { globSync } = fromVitest("tinyglobby") as typeof import("tinyglobby");
const picomatch = fromVitest("picomatch") as (
  glob: string | string[],
  options?: { dot?: boolean },
) => (path: string) => boolean;

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function fixture(files: Record<string, string | object>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-migrate-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

/** Paths a test-discovery differential runs over, shaped after the reporting app. */
const TREE = [
  "src/state/session/__tests__/session-core-test.ts",
  "src/components/Button.test.tsx",
  "src/foo.test.ios.tsx",
  "src/bar.spec.native.js",
  "src/__tests__/helpers.ts",
  "src/__tests__/lib/__mocks__/mocked.test.ts",
  "src/__tests__/__mocks__/direct.test.ts",
  "src/__e2e__/flow.test.ts",
  "src/my__e2e__x/other.test.ts",
  ".github/scripts/release.test.mjs",
  "scripts/icons/lib.test.mts",
  "bskylink/src/link.test.ts",
  "notbskylink/a.test.ts",
  "e2e/login.test.ts",
  "lib/e2e/nested.test.ts",
  "node_modules/pkg/index.test.ts",
  "src/__rsc_tests__/server.test.tsx",
  "src/snap.test.ts.snap",
];

/** Jest's discovery decision, modelled on @jest/core SearchSource + jest-runtime. */
function jestRuns(
  rel: string,
  opts: {
    testMatch: string[];
    testPathIgnorePatterns: string[];
    modulePathIgnorePatterns?: string[];
    moduleFileExtensions: string[];
  },
  rootDir = "/abs/project",
): boolean {
  const abs = `${rootDir}/${rel}`;
  const sub = (p: string) => p.replace(/<rootDir>/g, rootDir);
  const ext = path.extname(rel).slice(1);
  if (!opts.moduleFileExtensions.includes(ext)) return false;
  const hidden = (opts.modulePathIgnorePatterns ?? []).map(sub);
  if (hidden.length && new RegExp(hidden.join("|")).test(abs)) return false;
  if (!picomatch(opts.testMatch.map(sub), { dot: true })(abs)) return false;
  const ignore = opts.testPathIgnorePatterns.map(sub);
  return !(ignore.length && new RegExp(ignore.join("|")).test(abs));
}

/** What Vitest collects with this include/exclude, from a real directory. */
function vitestCollects(root: string, include: string[], exclude: string[]): string[] {
  return globSync(include, { cwd: root, dot: true, ignore: exclude, expandDirectories: false })
    .map((f) => f.split(path.sep).join("/"))
    .sort();
}

function tree(paths: string[]): string {
  return fixture(Object.fromEntries(paths.map((p) => [p, ""])));
}

// jest-expo 57.0.5's getPlatformPreset for ['ios', 'native'] (config/getPlatformPreset.js
// and config/extensions.js), the discovery keys only.
const JEST_EXPO_IOS = {
  testMatch: ["", "ios", "native"].flatMap((platform) => {
    const p = platform ? `.${platform}` : "";
    return [
      `**/__tests__/**/*spec${p}.[jt]s?(x)`,
      `**/__tests__/**/*test${p}.[jt]s?(x)`,
      `**/?(*.)+(spec|test)${p}.[jt]s?(x)`,
    ];
  }),
  testPathIgnorePatterns: ["/node_modules/", "/__rsc_tests__/"],
  moduleFileExtensions: [
    ...["ios", "native", ""].flatMap((platform) =>
      ["ts", "tsx", "js", "jsx"].map((ext) => (platform ? `${platform}.${ext}` : ext)),
    ),
    "json",
  ],
};

describe("ignore-pattern regexes become exclude globs", () => {
  it("converts the shapes it can translate exactly", () => {
    expect(ignorePatternToGlobs("bskylink/.*")).toEqual(["**/*bskylink/**"]);
    expect(ignorePatternToGlobs("<rootDir>/e2e/")).toEqual(["e2e/**"]);
    expect(ignorePatternToGlobs("/__rsc_tests__/")).toEqual(["**/__rsc_tests__/**"]);
    expect(ignorePatternToGlobs("\\.snap$")).toEqual(["**/*.snap"]);
    expect(ignorePatternToGlobs("__tests__/.*/__mocks__")).toEqual([
      "**/*__tests__/*/**/__mocks__*",
      "**/*__tests__/*/**/__mocks__*/**",
    ]);
  });

  it("leaves regex syntax with no exact glob form for a human", () => {
    for (const p of ["(a|b)/", "[0-9]+/", "\\d+", "^/abs/", "a.b", "foo.*bar", "x?"]) {
      expect(ignorePatternToGlobs(p), p).toBeNull();
    }
  });

  it("selects exactly the files Jest's regex does, measured with tinyglobby", () => {
    const root = tree(TREE.filter((p) => !p.startsWith("node_modules/")));
    const all = vitestCollects(root, ["**/*"], []);
    for (const pattern of [
      "bskylink/.*",
      "__e2e__/.*",
      "__tests__/.*/__mocks__",
      "<rootDir>/e2e/",
      "/e2e/",
      "\\.snap$",
      "/__rsc_tests__/",
      "/__e2e__",
    ]) {
      const globs = ignorePatternToGlobs(pattern);
      expect(globs, pattern).not.toBeNull();
      const jestIgnores = all.filter((rel) =>
        new RegExp(pattern.replace(/<rootDir>/g, "/abs/project")).test(`/abs/project/${rel}`),
      );
      const excluded = all.filter((rel) => !vitestCollects(root, ["**/*"], globs!).includes(rel));
      expect(excluded, pattern).toEqual(jestIgnores);
    }
  });
});

describe("Jest's testMatch globs, collected by Vitest", () => {
  it("are accepted by tinyglobby unchanged and select what Jest's picomatch selects", () => {
    const root = tree(TREE);
    for (const [label, opts] of Object.entries({
      "jest-expo/ios": JEST_EXPO_IOS,
      "jest 30 defaults": translateDiscoveryDefaults(30),
      "jest 29 defaults": translateDiscoveryDefaults(29),
    })) {
      const result = translateDiscovery({}, opts, null);
      const expected = TREE.filter((rel) => jestRuns(rel, opts)).sort();
      const collected = vitestCollects(root, result.include!, [
        ...configDefaults.exclude,
        ...result.exclude,
      ]);
      expect(collected, label).toEqual(expected);
    }
  });

  it("keeps Jest's own default ignore (/node_modules/) to Vitest's default exclude", () => {
    // translateDiscovery skips '/node_modules/' because configDefaults.exclude, which
    // the generated config spreads first, already holds the equivalent glob.
    expect(configDefaults.exclude).toContain("**/node_modules/**");
  });

  it("hides the extensions moduleFileExtensions leaves out", () => {
    expect(extensionExclude(JEST_EXPO_IOS.moduleFileExtensions)).toBe("**/*.{mjs,cjs,mts,cts}");
    expect(
      extensionExclude(["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "node"]),
    ).toBeNull();
  });
});

/** Jest's documented defaults, via translateDiscovery's own table. */
function translateDiscoveryDefaults(major: 29 | 30) {
  const testMatch =
    major === 29
      ? ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[tj]s?(x)"]
      : ["**/__tests__/**/*.?([mc])[jt]s?(x)", "**/?(*.)+(spec|test).?([mc])[jt]s?(x)"];
  const moduleFileExtensions =
    major === 29
      ? ["js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "node"]
      : ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "node"];
  // The table translateDiscovery falls back to must be these values.
  const viaDefaults = translateDiscovery({}, null, major);
  expect(viaDefaults.include).toEqual(testMatch);
  return { testMatch, testPathIgnorePatterns: ["/node_modules/"], moduleFileExtensions };
}

describe("test script flags", () => {
  it("reads the Jest invocation out of a shell command", () => {
    const parsed = parseJestScript(
      "test",
      "NODE_ENV=test jest --forceExit --testTimeout=20000 --bail",
    )!;
    expect(Object.fromEntries(parsed.flags)).toEqual({
      forceExit: true,
      testTimeout: "20000",
      bail: true,
    });
    const spaced = parseJestScript("test", "yarn jest -w 2 --test-timeout 900 src/ && tsc")!;
    expect(Object.fromEntries(spaced.flags)).toEqual({ w: "2", testTimeout: "900" });
    expect(spaced.positional).toEqual(["src/"]);
    expect(parseJestScript("test", "vitest run")).toBeNull();
  });
});

describe("transformIgnorePatterns allowlists with nested groups", () => {
  it("expands optional and nested groups into the names, prefixes and scopes they allow", () => {
    const { entries, unparseable } = extractAllowlistPackages(
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|await-lock)",
    );
    expect(unparseable).toEqual([]);
    expect(entries).toEqual([
      { name: "react-native", kind: "prefix" },
      { name: "jest-react-native", kind: "prefix" },
      { name: "@react-native", kind: "prefix" },
      { name: "@react-native-community", kind: "prefix" },
      { name: "expo", kind: "prefix" },
      { name: "exponent", kind: "prefix" },
      { name: "@expo", kind: "scope" },
      { name: "@exponent", kind: "scope" },
      { name: "@expo-google-fonts", kind: "scope" },
      { name: "react-navigation", kind: "prefix" },
      { name: "@react-navigation", kind: "scope" },
      { name: "await-lock", kind: "prefix" },
    ]);
  });

  it("reads jest-expo's own pattern, skipping pnpm's store directory", () => {
    const { entries, unparseable } = extractAllowlistPackages(
      "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))",
    );
    expect(unparseable).toEqual([]);
    expect(entries.map((e) => e.name)).toContain("@sentry/react-native");
    expect(entries.map((e) => e.name)).not.toContain(".pnpm");
  });
});

/** A project shaped like the jest-expo app the gaps were measured on. */
function blueskyLike(extra: Record<string, string | object> = {}): string {
  return fixture({
    "package.json": {
      name: "social-app",
      scripts: { test: "NODE_ENV=test jest --forceExit --testTimeout=20000 --bail" },
      dependencies: {
        expo: "57.0.0",
        "react-native": "0.86.0",
        "expo-image": "1.0.0",
        multiformats: "13.0.0",
        "await-lock": "2.2.2",
        "legacy-cjs": "1.0.0",
      },
      jest: {
        preset: "jest-expo/ios",
        transformIgnorePatterns: [
          "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|await-lock|legacy-cjs|multiformats)",
        ],
        modulePathIgnorePatterns: ["bskylink/.*", "__e2e__/.*", "__tests__/.*/__mocks__"],
        moduleNameMapper: {
          "^multiformats/cid$": "<rootDir>/node_modules/multiformats/dist/src/cid.js",
          "^config$": "<rootDir>/src/config.ts",
          "\\.(png|jpg|db)$": "<rootDir>/__mocks__/file.js",
        },
      },
    },
    "babel.config.js": `module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@lingui/babel-plugin-lingui-macro',
      ['babel-plugin-react-compiler', { target: '19' }],
      ['module-resolver', { alias: { '#': './src' } }],
      'react-native-worklets/plugin',
      'some-inline-env-plugin',
    ],
  }
}
`,
    "node_modules/jest-expo/ios/jest-preset.js": `module.exports = ${JSON.stringify(JEST_EXPO_IOS)};`,
    "node_modules/jest-expo/package.json": { name: "jest-expo", version: "57.0.5" },
    "node_modules/expo-image/package.json": {
      name: "expo-image",
      version: "1.0.0",
      peerDependencies: { "react-native": "*" },
    },
    "node_modules/multiformats/package.json": {
      name: "multiformats",
      version: "13.0.0",
      type: "module",
      exports: { ".": { import: "./dist/index.js" }, "./cid": { import: "./dist/src/cid.js" } },
    },
    "node_modules/await-lock/package.json": {
      name: "await-lock",
      version: "2.2.2",
      type: "module",
      exports: "./index.js",
    },
    "node_modules/legacy-cjs/package.json": {
      name: "legacy-cjs",
      version: "1.0.0",
      main: "index.js",
    },
    ...extra,
  });
}

describe("a jest-expo app's package.json#jest", () => {
  it("takes the preset's testMatch, the ignore patterns and the extension set", () => {
    const report = analyzeJestConfig(blueskyLike());
    const config = report.suggestedConfig;
    expect(config).toContain(`"**/__tests__/**/*test.[jt]s?(x)"`);
    expect(config).toContain(`"**/?(*.)+(spec|test).ios.[jt]s?(x)"`);
    expect(config).toContain(
      `exclude: [...configDefaults.exclude, "**/__rsc_tests__/**", "**/*bskylink/**", "**/*__e2e__/**", "**/*__tests__/*/**/__mocks__*", "**/*__tests__/*/**/__mocks__*/**", "**/*.{mjs,cjs,mts,cts}"]`,
    );
    expect(config).toContain(`import { configDefaults, defineConfig } from 'vitest/config'`);
    const text = [...report.automatic, ...report.attention].join("\n");
    expect(text).toContain("Jest also hid these paths from module resolution");
  });

  it("applies --testTimeout from the test script and reports the flags it does not map", () => {
    const report = analyzeJestConfig(blueskyLike());
    expect(report.suggestedConfig).toContain("testTimeout: 20000");
    expect(report.automatic.join("\n")).toContain("scripts.test --testTimeout=20000");
    expect(report.dropped.join("\n")).toContain("--forceExit");
    expect(report.attention.join("\n")).toContain("Vitest's test.bail counts failed TESTS");
    expect(report.suggestedConfig).not.toContain("bail");
  });

  it("maps anchored mappers exactly and drops the ones a package's exports already serve", () => {
    const report = analyzeJestConfig(blueskyLike());
    expect(report.suggestedConfig).toContain(
      `{ find: /^config$/, replacement: fileURLToPath(new URL("./src/config.ts", import.meta.url)) }`,
    );
    expect(report.suggestedConfig).toContain(
      `...Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement }))`,
    );
    expect(report.suggestedConfig).not.toContain("multiformats");
    expect(report.dropped.join("\n")).toContain(
      "'multiformats/cid' is served by its package's exports",
    );
  });

  it("states asset coverage from the plugin's own extension list", () => {
    const report = analyzeJestConfig(blueskyLike());
    expect(DEFAULT_ASSET_EXTS).not.toContain("db");
    expect(report.suggestedConfig).toContain(`assetExts: ["db"]`);
  });

  it("sends only what nothing else compiles to transform", () => {
    const report = analyzeJestConfig(blueskyLike());
    const text = report.automatic.join("\n");
    expect(text).toContain("allows expo-image — declares react-native");
    expect(text).toContain("allows await-lock and multiformats — ES modules");
    expect(report.suggestedConfig).toContain(`transform: ["legacy-cjs"]`);
  });

  it("names what the expo preset covers from the preset's module list", () => {
    const report = analyzeJestConfig(blueskyLike());
    const line = report.attention.find((l) => l.startsWith("preset: 'jest-expo/ios'"))!;
    // Every module the preset declares, and the honest limit — not "covered".
    for (const id of PRESET_MODULES.expo) expect(line).toContain(id);
    expect(line).toContain("is not reproduced");
    expect(report.automatic.join("\n")).not.toContain("are covered by");
  });

  it("classifies the project's Babel plugins", () => {
    const root = blueskyLike();
    const report = analyzeJestConfig(root);
    const all = [...report.automatic, ...report.attention, ...report.dropped].join("\n");
    // Required, and not emitted: no Vite 8 + @rolldown/plugin-babel installed here.
    expect(report.attention.join("\n")).toContain(
      "@lingui/babel-plugin-lingui-macro compiles macro imports away",
    );
    expect(all).toContain(`babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] })`);
    expect(report.suggestedConfig).not.toContain("plugin-babel");
    // module-resolver alias carried over.
    expect(report.suggestedConfig).toContain(
      `{ find: "#", replacement: fileURLToPath(new URL("./src", import.meta.url)) }`,
    );
    expect(report.dropped.join("\n")).toContain("react-native-worklets/plugin");
    expect(report.dropped.join("\n")).toContain("babel-plugin-react-compiler");
    expect(report.attention.join("\n")).toContain("some-inline-env-plugin ran on every file");

    const classified = classifyBabelPlugins(readBabelConfig(root));
    expect(classified.map((p) => [p.name, p.verdict])).toEqual([
      ["@lingui/babel-plugin-lingui-macro", "required"],
      ["babel-plugin-react-compiler", "unneeded"],
      ["babel-plugin-module-resolver", "alias"],
      ["react-native-worklets/plugin", "unneeded"],
      ["babel-plugin-some-inline-env-plugin", "unknown"],
    ]);

    const doctor = runDoctor(root).lines.join("\n");
    expect(doctor).toContain("Babel");
    expect(doctor).toContain("⚠ @lingui/babel-plugin-lingui-macro compiles macro imports away");
  });

  it("emits the Babel plugin when Vite 8 and @rolldown/plugin-babel are installed", () => {
    const report = analyzeJestConfig(
      blueskyLike({
        "node_modules/vite/package.json": { name: "vite", version: "8.0.0" },
        "node_modules/@rolldown/plugin-babel/package.json": {
          name: "@rolldown/plugin-babel",
          version: "0.2.4",
        },
        "node_modules/@babel/core/package.json": { name: "@babel/core", version: "7.29.0" },
      }),
    );
    expect(report.suggestedConfig).toContain(`import babel from '@rolldown/plugin-babel'`);
    expect(report.suggestedConfig).toContain(
      `babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }), jestMockTransform()`,
    );
  });
});

/**
 * The generated config, run. The unit assertions above check its text; this checks
 * that Vitest, loading it, collects the files Jest ran and applies the script's
 * timeout. Needs the built package (CI builds before tests).
 */
describe("the generated config, executed", () => {
  const distExists = fs.existsSync(path.join(packageRoot, "dist", "index.mjs"));

  it("needs dist", () => {
    expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  it.runIf(distExists)(
    "collects Jest's test set and runs with the script's --testTimeout",
    () => {
      const tests = {
        "src/state/session/__tests__/session-core-test.ts": "",
        "src/components/Button.test.tsx": "",
        "src/__tests__/lib/__mocks__/mocked.test.ts": "",
        "src/__e2e__/flow.test.ts": "",
        "bskylink/src/link.test.ts": "",
        ".github/scripts/release.test.mjs": "",
        "scripts/icons/lib.test.mts": "",
        "src/__rsc_tests__/server.test.tsx": "",
      };
      const root = blueskyLike(tests);
      // The Babel config is classified above; no Babel plugin package exists here.
      fs.rmSync(path.join(root, "babel.config.js"));
      // The project resolves vitest-native (this package) and its dependencies.
      const modules = path.join(root, "node_modules");
      for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
        if (fs.existsSync(path.join(modules, name))) continue;
        fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name));
      }
      fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"));

      const report = analyzeJestConfig(root);
      fs.writeFileSync(
        path.join(root, "vitest.config.mjs"),
        // Pinned to the mock engine: this project has no React Native installed, and
        // collection is what is under test.
        report.suggestedConfig.replace("reactNative({", "reactNative({ engine: 'mock', "),
      );
      const vitestBin = path.join(
        path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
        "vitest.mjs",
      );
      const listed = spawnSync(process.execPath, [vitestBin, "list", "--filesOnly", "--json"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CI: "1" },
      });
      expect(listed.status, listed.stderr).toBe(0);
      const files = (JSON.parse(listed.stdout) as { file: string }[])
        .map((f) => path.relative(fs.realpathSync(root), fs.realpathSync(f.file)))
        .sort();
      expect(files).toEqual([
        "src/components/Button.test.tsx",
        "src/state/session/__tests__/session-core-test.ts",
      ]);

      // The timeout: one test that reads its own resolved timeout.
      fs.writeFileSync(
        path.join(root, "src/components/Button.test.tsx"),
        `import { test, expect } from 'vitest'
test('timeout', ({ task }) => { expect(task.timeout).toBe(20000) })
`,
      );
      fs.writeFileSync(
        path.join(root, "src/state/session/__tests__/session-core-test.ts"),
        `import { test } from 'vitest'\ntest('runs', () => {})\n`,
      );
      const run = spawnSync(process.execPath, [vitestBin, "run"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CI: "1" },
      });
      expect(run.status, run.stdout + run.stderr).toBe(0);
    },
    120_000,
  );
});
