import { defineConfig, configDefaults } from 'vitest/config';
import { reactNative } from './src/index.js';

export default defineConfig({
  plugins: [reactNative({ diagnostics: true })],
  test: {
    // The native-engine suite (tests-native/) runs under its own config via
    // `test:native`; never run it under the default mock engine. `.tmp-spike*`
    // are scratch spikes that ship with their own setup.
    exclude: [...configDefaults.exclude, 'tests-native/**', '.tmp-spike*/**'],
  },
});
