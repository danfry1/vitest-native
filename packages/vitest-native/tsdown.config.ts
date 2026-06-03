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
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-native', 'vitest', 'vite', '@testing-library/react-native', '@testing-library/react-native/build/matchers/extend-expect', '@testing-library/react-native/build/matchers', 'react-test-renderer'],
  hooks: {
    // The native runtime is plain .mjs loaded by Node at runtime (incl. via
    // module.register), so it must ship verbatim rather than being bundled.
    'build:done': () => {
      const srcDir = path.resolve('src/native');
      const outDir = path.resolve('dist/native');
      fs.mkdirSync(outDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        if (f.endsWith('.mjs')) fs.copyFileSync(path.join(srcDir, f), path.join(outDir, f));
      }
    },
  },
});
