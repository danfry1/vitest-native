/**
 * migrate's generated config, run by Vitest: the end-to-end half of
 * migrate-discovery.test.ts. Each test runs Vitest for real on a scratch project, so it
 * lives in the end-to-end config, after the unit suite, where it cannot starve the unit
 * suite's fast tests of CPU.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli/index.js";
import { analyzeJestConfig } from "../src/cli/migrate.js";
import { blueskyLike, fixture, packageRoot } from "./support/migrate-fixtures.js";

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
      // The native realpath: Windows spells the temp directory both `RUNNER~1` and
      // `runneradmin`, and Vitest may report either.
      const real = fs.realpathSync.native;
      const files = (JSON.parse(listed.stdout) as { file: string }[])
        .map((f) => path.relative(real(root), real(f.file)).split(path.sep).join("/"))
        .sort();
      expect(files).toEqual([
        "src/components/Button.test.tsx",
        "src/state/session/__tests__/session-core-test.ts",
      ]);

      // The timeout: one test that reads its own resolved timeout.
      fs.writeFileSync(
        path.join(root, "src/components/Button.test.tsx"),
        `import { test, expect, vi } from 'vitest'
// A call made while the module loads, as a mocked dependency's import-time call is.
const loaded = vi.fn()
loaded('at import')
test('timeout', ({ task }) => { expect(task.timeout).toBe(20000) })
// Jest keeps it (clearMocks defaults to false); Vitest 5 clears it unless told not to.
test('import-time mock calls survive', () => { expect(loaded).toHaveBeenCalledTimes(1) })
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

  it.runIf(distExists)(
    "runs a suite that ran the real Reanimated on the real library, with its setUpTests() file (#834)",
    () => {
      // react-native-paper's shape: Reanimated's resolver, and a setup file that only calls
      // setUpTests(). Its tests read what the real library's animated components set.
      const root = fixture({
        // Declared, as an app declares it: the engine runs a declared package as itself.
        "package.json": {
          name: "app",
          dependencies: { "react-native": "*", "react-native-reanimated": "*" },
        },
        "jest.config.json": {
          preset: "react-native",
          resolver: "react-native-reanimated/jest/resolver",
          setupFilesAfterEnv: ["<rootDir>/jest/jestSetupAfterEnv.js"],
        },
        // As a Reanimated app's Babel config has it: the worklets plugin compiles the
        // hooks' worklets.
        "babel.config.js":
          "module.exports = {\n  presets: ['module:@react-native/babel-preset'],\n  plugins: ['react-native-worklets/plugin'],\n};\n",
        "jest/jestSetupAfterEnv.js": `import { setUpTests } from 'react-native-reanimated';\n\nsetUpTests();\n`,
        "src/Box.test.tsx": `import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Animated, { getAnimatedStyle, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

function Box() {
  const opacity = useSharedValue(0.5);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="box" style={[{ width: 10 }, style]} />;
}

it('reads the animated style the real library sets', async () => {
  await render(<Box />);
  expect(getAnimatedStyle(screen.getByTestId('box'))).toEqual({ width: 10, opacity: 0.5 });
  expect(screen.getByTestId('box')).toHaveAnimatedStyle({ opacity: 0.5 });
});
`,
      });
      const modules = path.join(root, "node_modules");
      fs.mkdirSync(modules, { recursive: true });
      for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
        if (fs.existsSync(path.join(modules, name))) continue;
        fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name));
      }
      fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"));
      const report = analyzeJestConfig(root);
      expect(report.suggestedConfig).toContain("presets: { reanimated: false }");
      expect(report.suggestedConfig).toContain("jestSetupAfterEnv");
      const vitestBin = path.join(
        path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
        "vitest.mjs",
      );
      const run = (config: string) => {
        fs.writeFileSync(path.join(root, "vitest.config.mjs"), config);
        return spawnSync(process.execPath, [vitestBin, "run"], {
          cwd: root,
          encoding: "utf8",
          env: { ...process.env, CI: "1" },
        });
      };
      const real = run(report.suggestedConfig);
      expect(real.status, real.stdout + real.stderr).toBe(0);
      // The control: the same config with the preset on serves Reanimated's mock, whose
      // components set nothing for these readers (#834).
      const mocked = run(report.suggestedConfig.replace("presets: { reanimated: false }", ""));
      expect(mocked.status, mocked.stdout + mocked.stderr).not.toBe(0);
      expect(mocked.stdout + mocked.stderr).toContain(
        "reads the animated style the real library sets",
      );
    },
    180_000,
  );

  it.runIf(distExists)(
    "resolves a literal prefix mapper and skips a $-anchored ignore, as Jest did",
    () => {
      const root = fixture({
        "package.json": { name: "app", type: "module" },
        "jest.config.json": {
          moduleNameMapper: { "^~e2e/(.*)$": "<rootDir>/e2e/$1" },
          testPathIgnorePatterns: ["/node_modules/", "/__tests__/testHelpers\\.test\\.ts$"],
        },
        "e2e/helpers/data.ts": "export const value = 42\n",
        "src/__tests__/uses-alias.test.ts":
          "import { test, expect } from 'vitest'\nimport { value } from '~e2e/helpers/data'\n" +
          "test('alias', () => { expect(value).toBe(42) })\n",
        "src/__tests__/testHelpers.test.ts": "throw new Error('Jest never ran this file')\n",
        // A bare `~e2e` is not under the mapper's pattern; Jest resolved it as a package.
        "node_modules/~e2e/package.json": { name: "~e2e", main: "index.js" },
        "node_modules/~e2e/index.js": "module.exports = { bare: true }\n",
        "src/__tests__/bare.test.ts":
          "import { test, expect } from 'vitest'\nimport pkg from '~e2e'\n" +
          "test('bare', () => { expect(pkg.bare).toBe(true) })\n",
      });
      const modules = path.join(root, "node_modules");
      fs.mkdirSync(modules, { recursive: true });
      for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
        if (fs.existsSync(path.join(modules, name))) continue;
        fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name));
      }
      fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"));
      const report = analyzeJestConfig(root);
      expect(report.automatic.join("\n")).toContain(
        `'/__tests__/testHelpers\\.test\\.ts$' → test.exclude ["**/__tests__/testHelpers.test.ts"]`,
      );
      fs.writeFileSync(
        path.join(root, "vitest.config.mjs"),
        report.suggestedConfig.replace("reactNative({", "reactNative({ engine: 'mock', "),
      );
      const vitestBin = path.join(
        path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
        "vitest.mjs",
      );
      const run = spawnSync(process.execPath, [vitestBin, "run"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CI: "1" },
      });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("2 passed");
    },
    120_000,
  );

  it.runIf(distExists)(
    "--write --force replaces the config Vitest's own lookup loads",
    () => {
      const root = fixture({
        "package.json": { name: "x" },
        "tsconfig.json": {},
        "jest.config.json": { testTimeout: 9123 },
        // Vitest looks up vitest.config.ts before vitest.config.mts.
        "vitest.config.ts": "export default { test: { testTimeout: 1 } }",
      });
      const modules = path.join(root, "node_modules");
      fs.mkdirSync(modules);
      for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
        fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name));
      }
      fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"));

      const lines: string[] = [];
      expect(main(["migrate", "--write", "--force", "--root", root], (l) => lines.push(l))).toBe(0);
      expect(lines.join("\n")).toContain("replaced the existing vitest.config.ts");
      // Vitest's own lookup and load (vitest/node's resolveConfig), in a child process so
      // the plugin the config loads starts outside this worker.
      const probe = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { resolveConfig } from 'vitest/node'
const c = await resolveConfig({ root: process.cwd(), watch: false })
console.log('RESOLVED ' + JSON.stringify({ file: c.configFile, timeout: c.test.testTimeout }))
process.exit(0)`,
        ],
        { cwd: root, encoding: "utf8", env: { ...process.env, CI: "1" } },
      );
      const line = probe.stdout.split("\n").find((l) => l.startsWith("RESOLVED "));
      expect(line, probe.stdout + probe.stderr).toBeDefined();
      const resolved = JSON.parse((line as string).slice("RESOLVED ".length));
      expect(fs.realpathSync(resolved.file)).toBe(
        fs.realpathSync(path.join(root, "vitest.config.ts")),
      );
      // The loaded config is migrate's: the Jest config's timeout, not the old file's.
      expect(resolved.timeout, lines.join("\n")).toBe(9123);
      expect(fs.existsSync(path.join(root, "vitest.config.mts"))).toBe(false);
    },
    60_000,
  );

  it.runIf(distExists)(
    "--write over a vite.config writes the config Vitest's own lookup loads, and says so",
    () => {
      const root = fixture({
        "package.json": { name: "x" },
        "tsconfig.json": {},
        "jest.config.json": { testTimeout: 9123 },
        "vite.config.ts": "export default { test: { testTimeout: 1 } }",
      });
      const modules = path.join(root, "node_modules");
      fs.mkdirSync(modules);
      for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
        fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name));
      }
      fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"));

      const lines: string[] = [];
      expect(main(["migrate", "--write", "--root", root], (l) => lines.push(l))).toBe(0);
      const output = lines.join("\n");
      expect(output).toContain("✓ wrote vitest.config.mts from the analysis above.");
      expect(output).toContain(
        "! Vitest now loads vitest.config.mts instead of vite.config.ts: it reads a vite.config.* only when",
      );
      const probe = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { resolveConfig } from 'vitest/node'
const c = await resolveConfig({ root: process.cwd(), watch: false })
console.log('RESOLVED ' + JSON.stringify({ file: c.configFile, timeout: c.test.testTimeout }))
process.exit(0)`,
        ],
        { cwd: root, encoding: "utf8", env: { ...process.env, CI: "1" } },
      );
      const line = probe.stdout.split("\n").find((l) => l.startsWith("RESOLVED "));
      expect(line, probe.stdout + probe.stderr).toBeDefined();
      const resolved = JSON.parse((line as string).slice("RESOLVED ".length));
      // The file the CLI named is the one Vitest loads, and the vite.config's settings are gone.
      expect(fs.realpathSync(resolved.file)).toBe(
        fs.realpathSync(path.join(root, "vitest.config.mts")),
      );
      expect(resolved.timeout, output).toBe(9123);
    },
    60_000,
  );
});
