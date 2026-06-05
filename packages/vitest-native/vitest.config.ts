import { defineConfig, configDefaults } from 'vitest/config';
import { reactNative } from './src/index.js';

export default defineConfig({
  // Pinned to mock: this suite asserts mock-engine behavior. Pinning keeps it stable
  // across the future v1 auto->native flip and silences the native nudge in our own run.
  plugins: [reactNative({ engine: "mock", diagnostics: true })],
  test: {
    // The native-engine suite (tests-native/) runs under its own config via
    // `test:native`; never run it under the default mock engine. `.tmp-spike*`
    // are scratch spikes that ship with their own setup.
    exclude: [...configDefaults.exclude, 'tests-native/**', '.tmp-spike*/**'],
  },
});
