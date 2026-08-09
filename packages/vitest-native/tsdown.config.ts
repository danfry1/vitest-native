import { defineConfig } from 'tsdown';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    helpers: 'src/helpers.ts',
    setup: 'src/setup.ts',
    serializer: 'src/serializer.ts',
    presets: 'src/presets/index.ts',
    matchers: 'src/matchers/animated.ts',
    'jest-compat': 'src/jest-compat/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      'react',
      'react-native',
      'vitest',
      'vitest/node',
      'vite',
      'magic-string',
      '@testing-library/react-native',
      '@testing-library/react-native/build/matchers/extend-expect',
      '@testing-library/react-native/build/matchers',
      'react-test-renderer',
    ],
  },
  hooks: {
    // The native runtime + jest-compat shims are plain .mjs loaded by Node at
    // runtime (native: via module.register; jest-compat: as setup file / alias
    // targets resolved by Vite), so they must ship verbatim rather than bundled.
    'build:done': () => {
      // Three entries depend on vitest at module scope, and vitest throws when it is
      // reached through require(). Their CJS bundles therefore could not be loaded at
      // all, so `exports` points require() and import() at the one .mjs build instead —
      // Node >= 20.19 loads it through require(esm), which is why `engines` sets that
      // floor. Emitting the dead CJS would ship files no declared entry can reach.
      for (const name of ['index', 'setup', 'presets']) {
        for (const ext of ['cjs', 'd.cts']) {
          fs.rmSync(path.resolve('dist', `${name}.${ext}`), { force: true });
        }
      }
      // Top-level runtime .mjs (errors.mjs) ships verbatim too: the shipped runtimes
      // below import it by relative path, and the tests load those same files from src,
      // so it must resolve in both trees as one module rather than a bundled copy.
      for (const f of fs.readdirSync(path.resolve('src'))) {
        if (f.endsWith('.mjs') || f.endsWith('.d.mts')) {
          fs.copyFileSync(path.resolve('src', f), path.resolve('dist', f));
        }
      }
      for (const sub of ['native', 'jest-compat']) {
        const srcDir = path.resolve('src', sub);
        const outDir = path.resolve('dist', sub);
        fs.mkdirSync(outDir, { recursive: true });
        for (const f of fs.readdirSync(srcDir)) {
          // Ship runtime .mjs verbatim, plus hand-written .d.mts type stubs for them.
          if (f.endsWith('.mjs') || f.endsWith('.d.mts')) {
            fs.copyFileSync(path.join(srcDir, f), path.join(outDir, f));
          }
        }
      }
    },
  },
});
