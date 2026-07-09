/**
 * The vitest-native CLI: init / doctor / migrate against fixture projects.
 * Tests import main() and the per-command functions directly (the bin guard
 * only fires when argv[1] is the CLI itself).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli/index.js";
import { runInit, renderInitConfig } from "../src/cli/init.js";
import { runDoctor } from "../src/cli/doctor.js";
import {
  analyzeJestConfig,
  extractAllowlistPackages,
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

  it("writes the jest-compat variant matching the migration guide's shape", () => {
    const root = fixture({ "package.json": { name: "x" } });
    const result = runInit(root, { jestCompat: true });
    expect(result.wrote).toBe("vitest.config.mjs");
    const written = fs.readFileSync(path.join(root, "vitest.config.mjs"), "utf8");
    expect(written).toContain("jestMockTransform()");
    expect(written).toContain("setupFiles: [jestCompatSetup]");
    expect(written).toContain("globals: true");
    // jestMockTransform must come after reactNative (normal plugin order).
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

  it("flags RNTL 14 on a Node below 22.13", () => {
    const root = fixture({
      "package.json": { name: "x" },
      "node_modules/@testing-library/react-native/package.json": {
        name: "@testing-library/react-native",
        version: "14.0.0",
        main: "index.js",
      },
      "node_modules/@testing-library/react-native/index.js": "module.exports = {};",
    });
    const result = runDoctor(root, "22.12.0");
    expect(result.lines.join("\n")).toContain("requires Node >= 22.13");
    expect(result.ok).toBe(false);
  });

  it("passes cleanly against this package's own environment", () => {
    // fileURLToPath, not URL.pathname: the latter yields "/C:/…" on Windows.
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const pkgRoot = path.resolve(HERE, "..");
    const result = runDoctor(pkgRoot);
    expect(result.ok).toBe(true);
    expect(result.lines.join("\n")).toContain("resolves to NATIVE");
  });
});

describe("migrate", () => {
  it("extracts packages from the classic transformIgnorePatterns allowlist", () => {
    expect(
      extractAllowlistPackages("node_modules/(?!(?:react-native|@react-native|moti|uniwind)/)"),
    ).toEqual({
      packages: ["react-native", "@react-native", "moti", "uniwind"],
      unparseable: [],
    });
    expect(extractAllowlistPackages("node_modules")).toEqual({ packages: [], unparseable: [] });
    // Capturing groups would fabricate names if stripped ("jest-react-native") —
    // they must be surfaced as unparseable instead.
    expect(extractAllowlistPackages("node_modules/(?!(jest-)?react-native|expo)")).toEqual({
      packages: ["expo"],
      unparseable: ["(jest-)?react-native"],
    });
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
    });
    const report = analyzeJestConfig(root);
    expect(report.ok).toBe(true);
    expect(report.source).toBe("jest.config.json");
    const text = renderMigrationReport(report).join("\n");
    // transform allowlist: moti extracted, RN handled, reanimated preset-covered.
    expect(report.suggestedConfig).toContain(`transform: ["moti"]`);
    expect(text).toContain("'react-native-reanimated' — shadowed by the auto-detected preset");
    // asset mapper recognized as built-in; alias mapped ABSOLUTE (Vite resolves
    // string-substituted aliases relative to the importer); setup preserved.
    expect(text).toContain("asset stubbing is built in");
    expect(report.suggestedConfig).toContain(
      `"@": fileURLToPath(new URL("./src", import.meta.url))`,
    );
    expect(report.suggestedConfig).toContain(`import { fileURLToPath } from 'node:url'`);
    expect(report.suggestedConfig).toContain(`"./jest.setup.js"`);
    expect(report.suggestedConfig).toContain("testTimeout: 15000");
    // manual mock covered by preset; unknown key surfaced.
    expect(text).toContain("__mocks__/react-native-gesture-handler");
    expect(text).toContain("'someCustomKey' — unrecognized Jest key");
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
  });
});
