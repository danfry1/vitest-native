import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    helpers: 'src/helpers.ts',
    setup: 'src/setup.ts',
    serializer: 'src/serializer.ts',
    presets: 'src/presets/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-native', 'vitest', 'vite', '@testing-library/react-native', '@testing-library/react-native/build/matchers/extend-expect', '@testing-library/react-native/build/matchers', 'react-test-renderer'],
});
