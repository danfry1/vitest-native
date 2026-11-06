/**
 * `vitest-native init` — write a ready-to-run Vitest config. Two shapes:
 * the zero-config default, and the jest-compat variant (the exact block the
 * migration guide documents, so docs and CLI can never drift apart by shape).
 */
import fs from "node:fs";
import path from "node:path";
import { usesVitePlus } from "../host.js";

/**
 * Printed after `init` and `migrate`: the hot runtime is off by default, so a user
 * reading only the CLI output would not otherwise learn it exists or what it costs.
 */
export const HOT_RUNTIME_NOTE = [
  "Hot runtime: off by default. `hotRuntime: 'auto'` reuses workers across test files instead of",
  "starting a fresh one per file. Whether that is faster depends on the suite, so measure it on yours.",
  "It has known differences from per-file isolation:",
  "  https://danfry1.github.io/vitest-native/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files",
];

export interface InitOptions {
  jestCompat?: boolean;
  force?: boolean;
}

export interface InitResult {
  lines: string[];
  ok: boolean;
  wrote?: string;
}

const PLAIN_CONFIG = `import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'

export default defineConfig({
  // Zero config: engine 'auto' runs REAL React Native (mocking only the native
  // boundary) when @react-native/babel-preset + @babel/core are present, and
  // falls back to the pure-JS mock engine otherwise.
  plugins: [reactNative()],
  test: {
    environment: 'node',
  },
})
`;

const JEST_COMPAT_CONFIG = `import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'

export default defineConfig({
  // jestMockTransform() rewrites top-level jest.mock(...) into hoisted vi.mock(...).
  // Leave it without an \`enforce\`: it has to run after Vite strips TS/JSX and before
  // Vitest's own mock hoister. Its position relative to reactNative() does not matter.
  plugins: [reactNative(), jestMockTransform()],
  resolve: {
    dedupe: ['react', 'react-test-renderer', 'react-is'],
    alias: { ...jestCompatAliases() },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [jestCompatSetup],
  },
})
`;

/**
 * The config source. Under Vite+ the config is `vite.config.ts` with `defineConfig`
 * from 'vite-plus' (viteplus.dev/guide/test): the project does not install `vitest`
 * itself, so a config importing 'vitest/config' fails to load under pnpm.
 */
export function renderInitConfig(jestCompat: boolean, vitePlus = false): string {
  const source = jestCompat ? JEST_COMPAT_CONFIG : PLAIN_CONFIG;
  return vitePlus
    ? source.replace(
        "import { defineConfig } from 'vitest/config'",
        "import { defineConfig } from 'vite-plus'",
      )
    : source;
}

/**
 * Vitest's config file names, in the order it looks them up (CONFIG_EXTENSIONS in
 * vitest/dist/chunks/constants): the first that exists is the one it loads. Vitest
 * reads a vite.config.* only when there is no vitest.config.*; under Vite+, which
 * keeps tests in vite.config.*, existingConfig checks that first on purpose.
 */
const VITEST_CONFIG_FILES = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"].map(
  (ext) => `vitest.config${ext}`,
);

/** The config Vitest would load from `root`, or null when there is none to replace. */
function existingConfig(root: string, vitePlus: boolean): string | null {
  for (const name of [
    ...(vitePlus ? ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"] : []),
    ...VITEST_CONFIG_FILES,
  ]) {
    if (fs.existsSync(path.join(root, name))) return name;
  }
  return null;
}

export function runInit(root: string, opts: InitOptions = {}): InitResult {
  const lines: string[] = [];
  const vitePlus = usesVitePlus(root);
  const existing = existingConfig(root, vitePlus);
  if (existing && vitePlus && existing.startsWith("vite.config")) {
    // A Vite+ project keeps one config for build, lint and tests; replacing it would
    // drop the rest. The plugin goes into the existing file instead.
    return {
      lines: [
        `✗ ${existing} already exists. Vite+ keeps tests in the same config, so add`,
        `  vitest-native to it rather than replacing it:`,
        ``,
        `  import { reactNative } from 'vitest-native'`,
        ``,
        `  export default defineConfig({`,
        `    plugins: [reactNative()],`,
        `    test: { environment: 'node' },`,
        `  })`,
        ``,
        `  Then run: vp test`,
      ],
      ok: false,
    };
  }
  // vitest-native writes ES module configs, and does not rewrite a CommonJS one in place:
  // a new file beside it would leave a config that looks live but is not loaded.
  if (existing && /\.c[jt]s$/.test(existing)) {
    return {
      lines: [
        `✗ ${existing} is a CommonJS config. vitest-native writes ES module configs and does not`,
        `  rewrite a CommonJS one; remove or rename ${existing}, then re-run.`,
      ],
      ok: false,
    };
  }
  if (existing && !opts.force) {
    return {
      lines: [
        `✗ ${existing} already exists — not overwriting. Re-run with --force to replace it,`,
        `  or run \`vitest-native migrate\` to analyze an existing Jest setup first.`,
      ],
      ok: false,
    };
  }

  // --force replaces the file Vitest loads, in place: written beside it under another
  // name, the new config would sit unread wherever Vitest looks that name up later
  // (vitest.config.ts before .mts). In a package without "type": "module", Vite bundles
  // an existing .ts or .js config to CommonJS; the ES module source still loads, with
  // Vite's warning about ESM syntax in a CommonJS-loaded file, as the old file did.
  // Otherwise TS projects get a .mts config (types flow through defineConfig) and
  // everything else .mjs, both ESM regardless of the package's "type".
  const file =
    existing ??
    (vitePlus
      ? "vite.config.ts"
      : fs.existsSync(path.join(root, "tsconfig.json"))
        ? "vitest.config.mts"
        : "vitest.config.mjs");
  const target = path.join(root, file);
  fs.writeFileSync(target, renderInitConfig(opts.jestCompat ?? false, vitePlus));

  lines.push(`✓ wrote ${file}${opts.jestCompat ? " (jest-compat variant)" : ""}`);
  if (existing) lines.push(`  (replaced the existing ${existing}, the config Vitest loads)`);
  lines.push(
    "",
    "Next steps:",
    vitePlus ? `  1. add a script: "test": "vp test"` : `  1. add a script: "test": "vitest"`,
    vitePlus ? `  2. run: vp test` : `  2. run: npx vitest`,
    `  3. check the environment: npx vitest-native doctor`,
  );
  if (opts.jestCompat) {
    lines.push(
      `  4. migrating a Jest suite? \`vitest-native migrate\` maps your jest.config onto this file.`,
    );
  }
  lines.push("", ...HOT_RUNTIME_NOTE);
  return { lines, ok: true, wrote: file };
}
