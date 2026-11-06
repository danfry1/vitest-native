/**
 * The vitest-native CLI: init / doctor / migrate against fixture projects.
 * Tests import main() and the per-command functions directly (the bin guard
 * only fires when argv[1] is the CLI itself).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main, unknownFlag } from "../src/cli/index.js";
import { HOT_RUNTIME_NOTE, runInit, renderInitConfig } from "../src/cli/init.js";
import { runDoctor } from "../src/cli/doctor.js";
import { PEER_REQUIREMENTS } from "../src/peer-requirements.js";
import { PRESET_MODULES } from "../src/preset-map.js";
import {
  analyzeJestConfig,
  extractAllowlistPackages,
  JEST_CONFIG_EXTENSIONS,
  renderMigrationReport,
} from "../src/cli/migrate.js";

function fixture(files: Record<string, string | object>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cli-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

/** Link the real @babel/parser in, as an installed React Native project has it. */
function withBabelParser(root: string): void {
  const fromCore = createRequire(createRequire(import.meta.url).resolve("@babel/core"));
  const parserDir = path.dirname(fromCore.resolve("@babel/parser/package.json"));
  fs.mkdirSync(path.join(root, "node_modules", "@babel"), { recursive: true });
  fs.symlinkSync(parserDir, path.join(root, "node_modules", "@babel", "parser"));
}

function capture(): { log: (l: string) => void; text: () => string } {
  const lines: string[] = [];
  return { log: (l) => lines.push(l), text: () => lines.join("\n") };
}

describe("cli dispatch", () => {
  it("prints usage and exits non-zero with no command", () => {
    const io = capture();
    expect(main([], io.log)).toBe(1);
    expect(io.text()).toContain("Usage:");
  });

  it("rejects an unknown command", () => {
    const root = fixture({ "package.json": { name: "x" } });
    const io = capture();
    expect(main(["frobnicate", "--root", root], io.log)).toBe(1);
    expect(io.text()).toContain("unknown command");
  });

  it("accepts --root before the command and exits 0 on explicit --help", () => {
    const root = fixture({ "package.json": { name: "x" } });
    const io = capture();
    // The --root VALUE must not be mistaken for the command.
    expect(main(["--root", root, "migrate"], io.log)).toBe(1); // no jest config → 1, but dispatched
    expect(io.text()).toContain("no Jest configuration found");
    expect(main(["--help"], capture().log)).toBe(0);
  });

  it("refuses a flag the command does not take, naming it and the valid ones", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": { preset: "react-native" },
    });
    for (const [args, unknown] of [
      [["migrate", "--wirte"], "--wirte"],
      [["init", "--frce"], "--frce"],
      [["doctor", "--verbose"], "--verbose"],
      [["compare", "--stirct"], "--stirct"],
      [["migrate", "--write=yes", "-u"], "-u"],
    ] as const) {
      const io = capture();
      expect(main([...args, "--root", root], io.log), args.join(" ")).toBe(1);
      expect(io.text()).toContain(
        `✗ unknown option ${unknown} for ${args[0]}. Valid: --root, --help`,
      );
    }
    // Nothing was written by the refused migrate --wirte.
    expect(fs.existsSync(path.join(root, "vitest.config.mjs"))).toBe(false);
    // The valid ones are listed, and a valued flag's value may itself start with "--".
    const io = capture();
    main(["compare", "--stirct", "--root", root], io.log);
    expect(io.text()).toContain("--strict");
    expect(unknownFlag("compare", ["--jest-args", "--runInBand", "--strict"])).toBeNull();
    expect(unknownFlag("compare", ["--jest-args=--ci", "--top", "3"])).toBeNull();
    expect(unknownFlag("migrate", ["--root", "--weird-dir-name", "--write"])).toBeNull();
    expect(unknownFlag("migrate", ["--write", "--frce"])).toBe("--frce");
  });

  it("refuses to run outside a package root", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cli-empty-"));
    const io = capture();
    expect(main(["doctor", "--root", empty], io.log)).toBe(1);
    expect(io.text()).toContain("no package.json");
  });
});

describe("init", () => {
  it("writes a TS config when tsconfig.json exists", () => {
    const root = fixture({ "package.json": { name: "x" }, "tsconfig.json": {} });
    const result = runInit(root);
    expect(result.ok).toBe(true);
    expect(result.wrote).toBe("vitest.config.mts");
    const written = fs.readFileSync(path.join(root, "vitest.config.mts"), "utf8");
    expect(written).toContain("reactNative()");
    expect(written).not.toContain("jestMockTransform");
  });

  it("says the hot runtime is opt-in and links its known differences", () => {
    const root = fixture({ "package.json": { name: "x" } });
    const output = runInit(root).lines.join("\n");
    expect(output).toContain(HOT_RUNTIME_NOTE.join("\n"));
    expect(output).toContain("hotRuntime: 'auto'");
    expect(output).toContain(
      "guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files",
    );
  });

  it("writes the jest-compat variant matching the migration guide's shape", () => {
    const root = fixture({ "package.json": { name: "x" } });
    const result = runInit(root, { jestCompat: true });
    expect(result.wrote).toBe("vitest.config.mjs");
    const written = fs.readFileSync(path.join(root, "vitest.config.mjs"), "utf8");
    expect(written).toContain("jestMockTransform()");
    expect(written).toContain("setupFiles: [jestCompatSetup]");
    expect(written).toContain("globals: true");
    // Pins the shape this command emits. Not an ordering requirement: the constraint
    // on jestMockTransform is that it declares no `enforce`, so it runs after Vite
    // strips TS/JSX and before Vitest's mock hoister. Both orders relative to
    // reactNative() were measured to work, under either engine, for a top-level
    // jest.mock whose factory returns JSX — and this repo's own bare consumer fixture
    // uses the opposite one.
    expect(written).toContain("plugins: [reactNative(), jestMockTransform()]");
  });

  it("refuses to overwrite an existing config without --force", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "vitest.config.ts": "export default {}",
    });
    expect(runInit(root).ok).toBe(false);
    expect(runInit(root, { force: true }).ok).toBe(true);
  });

  it("--force replaces the config Vitest loads, first in Vitest's lookup order, in place", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "tsconfig.json": {},
      "vitest.config.ts": "export default { test: { name: 'old' } }",
      "vitest.config.mts": "export default { test: { name: 'other' } }",
    });
    const result = runInit(root, { force: true });
    expect(result.ok).toBe(true);
    // Vitest looks up vitest.config.ts before .mts, so .ts is the one it loads.
    expect(result.wrote).toBe("vitest.config.ts");
    expect(fs.readFileSync(path.join(root, "vitest.config.ts"), "utf8")).toBe(
      renderInitConfig(false),
    );
    expect(fs.readFileSync(path.join(root, "vitest.config.mts"), "utf8")).toContain("'other'");
    expect(result.lines.join("\n")).toContain("replaced the existing vitest.config.ts");
  });

  it("--force refuses a CommonJS config instead of writing an ES module one beside it", () => {
    for (const name of ["vitest.config.cts", "vitest.config.cjs"]) {
      const root = fixture({ "package.json": { name: "x" }, [name]: "module.exports = {}" });
      const result = runInit(root, { force: true });
      expect(result.ok).toBe(false);
      expect(result.lines.join("\n")).toContain(`${name} is a CommonJS config`);
      // Without --force too: pointing at --force would only lead to this refusal.
      expect(runInit(root).lines.join("\n")).not.toContain("--force");
      expect(fs.readdirSync(root).filter((f) => f.startsWith("vitest.config"))).toEqual([name]);
    }
  });

  it("renderInitConfig variants are syntactically importable shapes", () => {
    for (const variant of [renderInitConfig(false), renderInitConfig(true)]) {
      expect(variant).toContain("export default defineConfig({");
      expect(variant).toContain("from 'vitest-native'");
    }
  });
});

describe("doctor", () => {
  it("fails on missing peers in an empty project", () => {
    const root = fixture({ "package.json": { name: "x" } });
    const result = runDoctor(root);
    expect(result.ok).toBe(false);
    expect(result.lines.join("\n")).toContain("vitest");
  });

  it("points an Expo project at what works, not at a removed caveat", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "node_modules/expo/package.json": { name: "expo", version: "57.0.0", main: "index.js" },
      "node_modules/expo/index.js": "module.exports = {};",
    });
    const output = runDoctor(root).lines.join("\n");
    expect(output).toContain("✓ expo 57.0.0 detected");
    expect(output).toContain("guide/expo");
    expect(output).not.toContain("known limits");
    // What the expo preset covers is its module list, not "Expo modules".
    expect(output).toContain(`expo preset shadows ${PRESET_MODULES.expo.join(", ")};`);
    expect(output).not.toContain("Expo modules are covered");
  });

  it("passes cleanly against this package's own environment", () => {
    // fileURLToPath, not URL.pathname: the latter yields "/C:/…" on Windows.
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const pkgRoot = path.resolve(HERE, "..");
    const result = runDoctor(pkgRoot);
    expect(result.ok).toBe(true);
    const output = result.lines.join("\n");
    expect(output).toContain("resolves to NATIVE");
    expect(output).toContain("Ownership model (inferred baseline)");
    expect(output).toContain("diagnostics: true for the resolved static policy");
  });
});

describe("migrate", () => {
  it("extracts packages from the classic transformIgnorePatterns allowlist", () => {
    expect(
      extractAllowlistPackages("node_modules/(?!(?:react-native|@react-native|moti|uniwind)/)"),
    ).toEqual({
      entries: [
        { name: "react-native", kind: "exact" },
        { name: "@react-native", kind: "scope" },
        { name: "moti", kind: "exact" },
        { name: "uniwind", kind: "exact" },
      ],
      unparseable: [],
    });
    expect(extractAllowlistPackages("node_modules")).toEqual({ entries: [], unparseable: [] });
    // An optional group is expanded into both names it allows — stripping it would
    // fabricate one ("jest-react-native" only). Without a trailing `/` each
    // alternative is a name PREFIX, as the regex means it.
    expect(extractAllowlistPackages("node_modules/(?!(jest-)?react-native|expo)")).toEqual({
      entries: [
        { name: "react-native", kind: "prefix" },
        { name: "jest-react-native", kind: "prefix" },
        { name: "expo", kind: "prefix" },
      ],
      unparseable: [],
    });
    // Character classes are outside the language it expands: surfaced, not guessed.
    expect(extractAllowlistPackages("node_modules/(?!(lib[0-9]|moti)/)")).toEqual({
      entries: [],
      unparseable: ["(lib[0-9]|moti)/"],
    });
  });

  it("does not send auto-detected packages to the transform allowlist", () => {
    // The engine detects packages that declare react-native and compiles them
    // itself. An explicit `transform` entry takes precedence over that, so emitting
    // one here would externalize the package instead of inlining it — losing
    // vi.mock support and gaining nothing.
    const root = fixture({
      "package.json": { name: "x", dependencies: { "some-rn-lib": "1", "plain-lib": "1" } },
      "node_modules/some-rn-lib/package.json": {
        name: "some-rn-lib",
        version: "1.0.0",
        main: "index.js",
        peerDependencies: { "react-native": "*" },
      },
      "node_modules/some-rn-lib/index.js": "module.exports = {};",
      "node_modules/plain-lib/package.json": {
        name: "plain-lib",
        version: "1.0.0",
        main: "index.js",
      },
      // Untranspiled JSX: the evidence that it needs compiling.
      "node_modules/plain-lib/index.js": "module.exports = <View />;",
      "jest.config.json": {
        transformIgnorePatterns: ["node_modules/(?!(?:some-rn-lib|plain-lib)/)"],
      },
    });
    withBabelParser(root);
    const report = analyzeJestConfig(root);
    const text = [...report.automatic, ...report.attention].join("\n");
    expect(text).toContain("allows some-rn-lib — detected by the engine");
    expect(report.suggestedConfig).not.toContain("some-rn-lib");
    // A package the engine does not detect, shipping JSX, still needs the entry.
    expect(report.suggestedConfig).toContain("plain-lib");
  });

  it("produces the full report for a representative jest config", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": {
        preset: "react-native",
        setupFilesAfterEnv: ["./jest.setup.js", "react-native/jest/setup"],
        moduleNameMapper: {
          "^@/(.*)$": "<rootDir>/src/$1",
          "\\.(png|jpg)$": "<rootDir>/__mocks__/fileMock.js",
        },
        transformIgnorePatterns: [
          "node_modules/(?!(?:react-native|react-native-reanimated|moti)/)",
        ],
        testTimeout: 15000,
        moduleFileExtensions: ["ts", "js"],
        someCustomKey: 1,
      },
      "__mocks__/react-native-gesture-handler.js": "module.exports = {};",
      // Installed, so the presets that shadow them are detected; moti ships JSX.
      "node_modules/react-native-reanimated/package.json": {
        name: "react-native-reanimated",
        version: "4.0.0",
      },
      "node_modules/react-native-gesture-handler/package.json": {
        name: "react-native-gesture-handler",
        version: "2.0.0",
      },
      "node_modules/moti/package.json": { name: "moti", version: "0.30.0", main: "index.js" },
      "node_modules/moti/index.js": "export const View = () => <div />;",
    });
    withBabelParser(root);
    const report = analyzeJestConfig(root);
    expect(report.ok).toBe(true);
    expect(report.source).toBe("jest.config.json");
    const text = renderMigrationReport(report).join("\n");
    expect(text).toContain(HOT_RUNTIME_NOTE.join("\n"));
    // transform allowlist: moti extracted, RN handled, reanimated preset-covered.
    expect(report.suggestedConfig).toContain(`transform: ["moti"]`);
    expect(text).toContain(
      "allows react-native-reanimated — shadowed by the auto-detected reanimated preset",
    );
    // asset mapper recognized as built-in, per extension; alias mapped ABSOLUTE (Vite
    // resolves string-substituted aliases relative to the importer); setup preserved.
    expect(text).toContain("the plugin handles png and jpg imports itself; delete");
    expect(report.suggestedConfig).toContain(
      `"@": fileURLToPath(new URL("./src", import.meta.url))`,
    );
    expect(report.suggestedConfig).toContain(`import { fileURLToPath } from 'node:url'`);
    expect(report.suggestedConfig).toContain(`"./jest.setup.js"`);
    expect(report.suggestedConfig).toContain("testTimeout: 15000");
    // manual mock covered by preset; unknown key surfaced.
    expect(text).toContain(
      "__mocks__/react-native-gesture-handler — the native engine runs react-native-gesture-handler with its own Jest setup",
    );
    expect(text).toContain("'someCustomKey' — unrecognized Jest key");
  });

  it("translates any literal prefix mapper and drops keys with no Vitest effect", () => {
    // Shapes from Rocket.Chat.ReactNative and react-native-paper.
    const report = analyzeJestConfig(
      fixture({
        "package.json": { name: "x" },
        "jest.config.json": {
          moduleNameMapper: {
            "^~e2e/(.*)$": "<rootDir>/e2e/$1",
            "^~/\\.rnstorybook/(.*)$": "<rootDir>/.rnstorybook/$1",
            "^@app/(.+)": "./app/$1",
            // Not a plain prefix: left for a human.
            "^(.*)/native$": "<rootDir>/$1/web",
            // A package target is a module request, not a project directory.
            "^ui/(.*)$": "some-ui-lib/src/$1",
          },
          watchPathIgnorePatterns: ["<rootDir>/node_modules"],
          workerIdleMemoryLimit: "512MB",
        },
      }),
    );
    const config = report.suggestedConfig;
    expect(config).toContain(`"~e2e": fileURLToPath(new URL("./e2e", import.meta.url))`);
    expect(config).toContain(
      `"~/.rnstorybook": fileURLToPath(new URL("./.rnstorybook", import.meta.url))`,
    );
    expect(config).toContain(`"@app": fileURLToPath(new URL("./app", import.meta.url))`);
    const attention = report.attention.join("\n");
    expect(attention).toContain("moduleNameMapper '^(.*)/native$'");
    expect(config).not.toContain("some-ui-lib");
    expect(attention).not.toContain("watchPathIgnorePatterns");
    expect(attention).not.toContain("workerIdleMemoryLimit");
    const dropped = report.dropped.join("\n");
    expect(dropped).toContain("watchPathIgnorePatterns — affects only Jest's watch mode");
    expect(dropped).toContain("workerIdleMemoryLimit — Vitest recycles workers by memory only");
  });

  it("calls a manual mock covered only where an active preset shadows that module", () => {
    // The claim is read from PRESET_MODULES (held to the presets by
    // tests/presets.test.ts) and the plugin's detection. The expo preset is detected, but the native
    // engine the generated config uses runs expo-font as itself
    // (NATIVE_ENGINE_RUNS_PACKAGES), so its manual mock stays, as does svg's, whose
    // preset is not detected.
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": { preset: "react-native" },
      "node_modules/expo-constants/package.json": { name: "expo-constants", version: "1.0.0" },
      "node_modules/react-native-gesture-handler/package.json": {
        name: "react-native-gesture-handler",
        version: "2.20.0",
      },
      "__mocks__/react-native-gesture-handler.js": "module.exports = {};",
      "__mocks__/expo-font.js": "module.exports = {};",
      "__mocks__/react-native-svg.js": "module.exports = {};",
    });
    const covered = analyzeJestConfig(root).presetCovered.join("\n");
    // gesture-handler runs as itself under the native engine, with its own jestSetup
    // standing in for its native layer (LIBRARY_SETUP_FILES), so its manual mock goes.
    expect(covered).toContain(
      "__mocks__/react-native-gesture-handler — the native engine runs react-native-gesture-handler with its own Jest setup",
    );
    expect(covered).not.toContain("expo-font");
    expect(covered).not.toContain("react-native-svg");
  });

  it("deletes a library's own test setup that a detected preset replaces", () => {
    // Unistyles documents `setupFiles: ['react-native-unistyles/mocks']` for Jest. Carried
    // across, its jest.mock() calls (under the jest-compat shim) replaced the preset:
    // variants stripped, no theme. A setup file of a package nothing shadows stays.
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": {
        preset: "react-native",
        setupFiles: ["react-native-unistyles/mocks", "some-lib/jest-setup"],
      },
      "node_modules/react-native-unistyles/package.json": {
        name: "react-native-unistyles",
        version: "3.4.0",
      },
    });
    const report = analyzeJestConfig(root);
    expect(report.presetCovered.join("\n")).toContain(
      "setupFiles: 'react-native-unistyles/mocks' — react-native-unistyles's own test setup; " +
        "the auto-detected unistyles preset shadows react-native-unistyles",
    );
    expect(report.suggestedConfig).not.toContain("react-native-unistyles/mocks");
    expect(report.suggestedConfig).toContain('"some-lib/jest-setup"');
  });

  it("deletes the Jest setup the native engine runs for a library, however it is written", () => {
    // gesture-handler's docs give `./node_modules/react-native-gesture-handler/jestSetup.js`;
    // `<rootDir>/node_modules/...` and the package request are as common. The engine runs
    // each library's own setup itself (LIBRARY_SETUP_FILES).
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": {
        preset: "react-native",
        setupFiles: [
          "./node_modules/react-native-gesture-handler/jestSetup.js",
          "<rootDir>/node_modules/@shopify/flash-list/jestSetup.js",
        ],
      },
      "node_modules/react-native-gesture-handler/package.json": {
        name: "react-native-gesture-handler",
        version: "3.4.0",
      },
      "node_modules/@shopify/flash-list/package.json": {
        name: "@shopify/flash-list",
        version: "2.3.3",
      },
    });
    const report = analyzeJestConfig(root);
    const covered = report.presetCovered.join("\n");
    expect(covered).toContain(
      "'./node_modules/react-native-gesture-handler/jestSetup.js' — react-native-gesture-handler's own test setup, which the native engine runs",
    );
    expect(covered).toContain(
      "'<rootDir>/node_modules/@shopify/flash-list/jestSetup.js' — @shopify/flash-list's own test setup, which the native engine runs",
    );
    expect(report.suggestedConfig).not.toContain("jestSetup");
  });

  it("keeps a library's other setup file, which the native engine does not run", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": {
        preset: "react-native",
        setupFiles: ["react-native-gesture-handler/lib/extra-setup.js"],
      },
      "node_modules/react-native-gesture-handler/package.json": {
        name: "react-native-gesture-handler",
        version: "3.4.0",
      },
    });
    const report = analyzeJestConfig(root);
    expect(report.presetCovered.join("\n")).not.toContain("extra-setup");
    expect(report.suggestedConfig).toContain("extra-setup");
  });

  it("rewrites <rootDir> in setup files instead of emitting it verbatim", () => {
    // The case above uses "./jest.setup.js", which happens to work as written. Real
    // Jest configs overwhelmingly say "<rootDir>/jest.setup.js", and Vitest does not
    // substitute <rootDir> — it resolved the string literally, so every test file in
    // the generated config failed with "Cannot find module .../<rootDir>/jest.setup.js"
    // while the report listed the mapping as automatic. testMatch, include and
    // moduleNameMapper already stripped the token; setup files were the one path that
    // did not.
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": {
        preset: "react-native",
        setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
        setupFiles: ["<rootDir>/config/polyfills.js"],
      },
    });
    const report = analyzeJestConfig(root);
    expect(report.suggestedConfig).not.toContain("<rootDir>");
    expect(report.suggestedConfig).toContain(
      `fileURLToPath(new URL("./jest.setup.js", import.meta.url))`,
    );
    expect(report.suggestedConfig).toContain(
      `fileURLToPath(new URL("./config/polyfills.js", import.meta.url))`,
    );
    expect(report.suggestedConfig).toContain(`import { fileURLToPath } from 'node:url'`);
  });

  it("reads package.json#jest and reports a missing config honestly", () => {
    const withEmbedded = fixture({
      "package.json": { name: "x", jest: { preset: "react-native" } },
    });
    expect(analyzeJestConfig(withEmbedded).source).toBe("package.json#jest");

    const without = fixture({ "package.json": { name: "x" } });
    const report = analyzeJestConfig(without);
    expect(report.ok).toBe(false);
    expect(renderMigrationReport(report).join("\n")).toContain("no Jest configuration found");
  });

  describe("jest-expo", () => {
    // React Navigation installed, which is what makes the plugin detect its preset.
    const expoApp = (preset: string, extra: Record<string, string | object> = {}) =>
      analyzeJestConfig(
        fixture({
          "package.json": { name: "x", dependencies: { expo: "56.0.0" } },
          "node_modules/@react-navigation/native/package.json": {
            name: "@react-navigation/native",
            version: "7.0.0",
            main: "index.js",
          },
          "node_modules/@react-navigation/native/index.js": "module.exports = {};",
          "jest.config.json": { preset },
          ...extra,
        }),
      );

    it("translates the preset and keeps React Navigation real, as jest-expo runs it", () => {
      const report = expoApp("jest-expo");
      expect(report.automatic.join("\n")).toContain("preset: 'jest-expo' → replaced by");
      expect(report.automatic.join("\n")).toContain("presets: { navigation: false }");
      // What jest-expo set up is not claimed as covered: the line says how the native
      // engine runs Expo modules and where it can differ, and jest-expo is not
      // installed in this fixture, so its testMatch could not be read.
      expect(report.attention).toEqual([
        `preset: 'jest-expo' — under the native engine, which the suggested config resolves to ` +
          `wherever React Native's Babel toolchain is installed, Expo modules run their own ` +
          `JavaScript on native-module mocks, as jest-expo runs them: each package's own mocks/ ` +
          `where it ships one, else jest-expo's table of the native modules; check tests that ` +
          `mock an Expo module's native side by hand.`,
        expect.stringContaining("preset: 'jest-expo' could not be loaded"),
      ]);
      expect(report.suggestedConfig).toContain(
        "reactNative({ presets: { navigation: false } }), jestMockTransform()",
      );
    });

    it("keeps the navigation preset where the project mocked React Navigation", () => {
      // Jest applied a root __mocks__/@react-navigation to node_modules by itself, so the
      // suite never saw the real navigators; the preset is the equivalent mock.
      const report = expoApp("jest-expo", {
        "__mocks__/@react-navigation/native.js": "module.exports = {};",
      });
      expect(report.suggestedConfig).toContain("reactNative(), jestMockTransform()");
      expect(report.presetCovered.join("\n")).toContain("__mocks__/@react-navigation/native");
    });

    it("leaves the plugin alone where the navigation preset would not be detected", () => {
      // expo-router from SDK 57 bundles its own React Navigation; with no
      // @react-navigation/* package installed there is no preset to switch off.
      const report = analyzeJestConfig(
        fixture({
          "package.json": { name: "x", dependencies: { expo: "57.0.0", "expo-router": "57.0.0" } },
          "jest.config.json": { preset: "jest-expo" },
        }),
      );
      expect(report.suggestedConfig).toContain("reactNative(), jestMockTransform()");
    });

    it("maps jest-expo/android onto the android platform", () => {
      expect(expoApp("jest-expo/android").suggestedConfig).toContain(
        "reactNative({ platform: 'android', presets: { navigation: false } })",
      );
      expect(expoApp("jest-expo/ios").suggestedConfig).not.toContain("platform:");
    });

    it("flags the multi-platform and non-native presets for a decision", () => {
      expect(expoApp("jest-expo/universal").attention.join("\n")).toContain(
        "Define a Vitest project for each native platform",
      );
      expect(expoApp("jest-expo/web").attention.join("\n")).toContain(
        "targets web, not a React Native render",
      );
    });
  });

  it("--write via main() saves the suggested config", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": { preset: "react-native", testTimeout: 9000 },
    });
    const io = capture();
    expect(main(["migrate", "--write", "--root", root], io.log)).toBe(0);
    const written = fs.readFileSync(path.join(root, "vitest.config.mjs"), "utf8");
    expect(written).toContain("testTimeout: 9000");
    expect(written).toContain("jestMockTransform()");
    // The config is saved, so the output gives the next step, not "re-run with --write".
    expect(io.text()).not.toContain("--write");
    expect(io.text()).toContain(
      "✓ wrote vitest.config.mjs from the analysis above. Next: npx vitest-native doctor && npx vitest",
    );
  });

  it("--write over an existing config points at --force, not at --write", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": { preset: "react-native" },
      "vitest.config.mjs": "export default {}",
    });
    const io = capture();
    expect(main(["migrate", "--write", "--root", root], io.log)).toBe(1);
    expect(fs.readFileSync(path.join(root, "vitest.config.mjs"), "utf8")).toBe("export default {}");
    expect(io.text()).toContain("--force");
    expect(io.text()).not.toContain("Re-run with --write");
  });

  it("without --write, main() asks for a re-run with --write and writes nothing", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.json": { preset: "react-native" },
    });
    const io = capture();
    expect(main(["migrate", "--root", root], io.log)).toBe(0);
    expect(fs.existsSync(path.join(root, "vitest.config.mjs"))).toBe(false);
    expect(io.text()).toContain(
      "Re-run with --write to save this config, then: npx vitest-native doctor && npx vitest",
    );
    expect(io.text()).not.toContain("✓ wrote");
  });
});

// ---------------------------------------------------------------------------
// Peer-range drift
// ---------------------------------------------------------------------------

/**
 * The supported ranges are declared twice by necessity: PEER_REQUIREMENTS drives the
 * plugin's startup check and doctor, while package.json's peerDependencies is what a
 * package manager reads. Nothing held the two together — bumping a bound in either
 * one alone passed every gate, and for RNTL the range was written a third time as a
 * hardcoded major comparison inside doctor.
 */
describe("peer requirements match the published peerDependencies", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8")) as {
    peerDependencies: Record<string, string>;
  };

  it("declares every checked peer in peerDependencies", () => {
    for (const { name } of PEER_REQUIREMENTS) {
      expect(manifest.peerDependencies, name).toHaveProperty(name);
    }
  });

  it("agrees on the minimum and the exclusive major ceiling", () => {
    const mismatches: string[] = [];
    for (const { name, minimum, maximumMajor } of PEER_REQUIREMENTS) {
      const declared = manifest.peerDependencies[name] ?? "";
      const minMajor = Number(minimum.split(".")[0]);
      // Every published range states its floor as a major, via ">=N" or "^N".
      const floors = [...declared.matchAll(/[\^>=]+\s*(\d+)/g)].map((m) => Number(m[1]));
      if (!floors.includes(minMajor)) {
        mismatches.push(
          `${name}: PEER_REQUIREMENTS minimum ${minimum} not a floor of "${declared}"`,
        );
      }
      if (maximumMajor !== undefined) {
        const ceiling = declared.match(/<\s*(\d+)/);
        const highestCaret = Math.max(
          0,
          ...[...declared.matchAll(/\^(\d+)/g)].map((m) => Number(m[1])),
        );
        const declaredCeiling = ceiling ? Number(ceiling[1]) : highestCaret + 1;
        if (declaredCeiling !== maximumMajor) {
          mismatches.push(
            `${name}: PEER_REQUIREMENTS maximumMajor ${maximumMajor} vs "${declared}" (ceiling ${declaredCeiling})`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Jest config files in every extension Jest reads
// ---------------------------------------------------------------------------

describe("migrate reads every jest.config extension Jest reads", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));

  /** A copy of tests/fixtures/jest-config-ts, so each test loads its own file. */
  const tsFixture = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cli-ts-"));
    fs.cpSync(path.join(HERE, "fixtures", "jest-config-ts"), root, { recursive: true });
    return root;
  };

  // Node strips TypeScript by default from 22.18 and 23.6; CI's 22.13 legs take the branch the
  // last test pins instead.
  const stripsTypes = Boolean(process.features.typescript);

  it.runIf(stripsTypes)(
    "loads a TypeScript config with a type-only import and module.exports",
    () => {
      const report = analyzeJestConfig(tsFixture());
      expect(report.source).toBe("jest.config.ts");
      expect(report.attention.join("\n")).not.toContain("jest.config.ts could not be loaded");
      expect(report.suggestedConfig).toContain("testTimeout: 7000");
      expect(report.suggestedConfig).toContain('"./.ci/setupTests.ts"');
    },
  );

  it("loads .mjs configs, and .mts and .cts where Node strips types", () => {
    const cases: Record<string, string> = {
      "jest.config.mjs": "export default { testTimeout: 6300 };\n",
      ...(stripsTypes && {
        "jest.config.mts":
          "const timeout: number = 6100;\nexport default { testTimeout: timeout };\n",
        "jest.config.cts":
          "const timeout: number = 6200;\nmodule.exports = { testTimeout: timeout };\n",
      }),
    };
    for (const [file, source] of Object.entries(cases)) {
      const report = analyzeJestConfig(fixture({ "package.json": { name: "x" }, [file]: source }));
      expect(report.source, file).toBe(file);
      expect(report.suggestedConfig, file).toMatch(/testTimeout: 6[123]00/);
    }
  });

  it("takes .mjs over .cjs and .json, as Jest does, on every supported Node", () => {
    const report = analyzeJestConfig(
      fixture({
        "package.json": { name: "x" },
        "jest.config.mjs": "export default { testTimeout: 4444 };\n",
        "jest.config.cjs": "module.exports = { testTimeout: 5555 };\n",
        "jest.config.json": { testTimeout: 6666 },
      }),
    );
    expect(report.source).toBe("jest.config.mjs");
    expect(report.suggestedConfig).toContain("testTimeout: 4444");
  });

  it.runIf(stripsTypes)("takes the first file in Jest's own order", () => {
    expect(JEST_CONFIG_EXTENSIONS).toEqual([".js", ".ts", ".mjs", ".mts", ".cjs", ".cts", ".json"]);
    const root = fixture({
      "package.json": { name: "x" },
      "jest.config.ts": "export default { testTimeout: 1111 };\n",
      "jest.config.cjs": "module.exports = { testTimeout: 2222 };\n",
      "jest.config.json": { testTimeout: 3333 },
    });
    const report = analyzeJestConfig(root);
    expect(report.source).toBe("jest.config.ts");
    expect(report.suggestedConfig).toContain("testTimeout: 1111");
  });

  it("says which file could not be loaded and why, instead of migrating nothing silently", () => {
    const fn = analyzeJestConfig(
      fixture({
        "package.json": { name: "x" },
        "jest.config.mjs": "export default async () => ({ testTimeout: 9 });\n",
      }),
    );
    expect(fn.attention.join("\n")).toContain(
      "jest.config.mjs could not be loaded (it exports a function, which Jest calls to build the config",
    );
    if (!stripsTypes) return;
    // Type stripping cannot erase an enum: the config is reported, not guessed at.
    const needsTranspile = analyzeJestConfig(
      fixture({
        "package.json": { name: "x" },
        "jest.config.ts":
          "enum Env { Node = 'node' }\nexport default { testEnvironment: Env.Node };\n",
      }),
    );
    expect(needsTranspile.attention.join("\n")).toMatch(
      /jest\.config\.ts could not be loaded \(.+\)/,
    );
  });

  it("explains a TypeScript config on a Node that cannot strip types", () => {
    const features = process.features as { typescript: unknown };
    const original = Object.getOwnPropertyDescriptor(features, "typescript");
    Object.defineProperty(features, "typescript", { value: false, configurable: true });
    try {
      const report = analyzeJestConfig(tsFixture());
      expect(report.attention.join("\n")).toContain(
        `does not load TypeScript by itself; run migrate on Node 22.18 or later`,
      );
      expect(report.suggestedConfig).not.toContain("testTimeout: 7000");
    } finally {
      if (original) Object.defineProperty(features, "typescript", original);
    }
  });
});
