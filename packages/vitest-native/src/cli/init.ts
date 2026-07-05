/**
 * `vitest-native init` — write a ready-to-run Vitest config. Two shapes:
 * the zero-config default, and the jest-compat variant (the exact block the
 * migration guide documents, so docs and CLI can never drift apart by shape).
 */
import fs from "node:fs";
import path from "node:path";

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
  // jestMockTransform() must come AFTER reactNative() and stay normal-order:
  // it rewrites top-level jest.mock(...) into hoisted vi.mock(...).
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

export function renderInitConfig(jestCompat: boolean): string {
  return jestCompat ? JEST_COMPAT_CONFIG : PLAIN_CONFIG;
}

function existingConfig(root: string): string | null {
  for (const name of [
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
  const existing = existingConfig(root);
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
  const file = fs.existsSync(path.join(root, "tsconfig.json"))
    ? "vitest.config.mts"
    : "vitest.config.mjs";
  const target = path.join(root, file);
  fs.writeFileSync(target, renderInitConfig(opts.jestCompat ?? false));

  lines.push(`✓ wrote ${file}${opts.jestCompat ? " (jest-compat variant)" : ""}`);
  if (existing && opts.force) lines.push(`  (replaced ${existing === file ? "it" : existing})`);
  lines.push(
    "",
    "Next steps:",
    `  1. add a script: "test": "vitest"`,
    `  2. run: npx vitest`,
    `  3. check the environment: npx vitest-native doctor`,
  );
  if (opts.jestCompat) {
    lines.push(
      `  4. migrating a Jest suite? \`vitest-native migrate\` maps your jest.config onto this file.`,
    );
  }
  return { lines, ok: true, wrote: file };
}
