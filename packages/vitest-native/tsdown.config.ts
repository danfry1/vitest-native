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
