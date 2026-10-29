/**
 * `vitest-native init` — write a ready-to-run Vitest config. Two shapes:
 * the zero-config default, and the jest-compat variant (the exact block the
 * migration guide documents, so docs and CLI can never drift apart by shape).
 */
import fs from "node:fs";
import path from "node:path";
import { usesVitePlus } from "../host.js";

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

function existingConfig(root: string, vitePlus: boolean): string | null {
  for (const name of [
    ...(vitePlus ? ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"] : []),
    "vitest.config.ts",
    "vitest.config.mts",
    "vitest.config.js",
    "vitest.config.mjs",
    "vitest.config.cts",
    "vitest.config.cjs",
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
  if (existing && !opts.force) {
    return {
      lines: [
        `✗ ${existing} already exists — not overwriting. Re-run with --force to replace it,`,
        `  or run \`vitest-native migrate\` to analyze an existing Jest setup first.`,
      ],
      ok: false,
    };
  }

  // TS projects get a .mts config (types flow through defineConfig); everything
  // else gets .mjs — both are ESM regardless of the package's "type".
  const file = vitePlus
    ? "vite.config.ts"
    : fs.existsSync(path.join(root, "tsconfig.json"))
      ? "vitest.config.mts"
      : "vitest.config.mjs";
  const target = path.join(root, file);
  fs.writeFileSync(target, renderInitConfig(opts.jestCompat ?? false, vitePlus));

  lines.push(`✓ wrote ${file}${opts.jestCompat ? " (jest-compat variant)" : ""}`);
  if (existing && opts.force) lines.push(`  (replaced ${existing === file ? "it" : existing})`);
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
  return { lines, ok: true, wrote: file };
}
