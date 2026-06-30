import { defineConfig, configDefaults } from 'vitest/config';
import { reactNative } from './src/index.js';

export default defineConfig({
  // Pinned to mock: this suite asserts mock-engine behavior. Diagnostics are
  // covered separately; keeping them off avoids repeating setup logs per worker.
  plugins: [reactNative({ engine: "mock" })],
  test: {
    // The native-engine suite (tests-native/) runs under its own config via
    // `test:native`; never run it under the default mock engine. `.tmp-spike*`
    // are scratch spikes that ship with their own setup. `crosscheck/**` runs only
    // via the differential orchestrator (`crosscheck`), which executes it under BOTH
    // engines — it must not run as part of the single-engine mock suite.
    // `consumer-tests/**` are copied into isolated projects and tested from the
    // packed tarball; running them here would use this repository's config.
    // `validation/**` is the idiomatic hot-parity oracle — it runs only via its
    // own native-engine configs (and `validate:hot-parity`), never the mock gate.
    exclude: [
      ...configDefaults.exclude,
      'tests-native/**',
      '.tmp-spike*/**',
      'crosscheck/**',
      'consumer-tests/**',
      'validation/**',
    ],
  },
});
