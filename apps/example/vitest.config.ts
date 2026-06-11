import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

// This example runs BOTH engines in a single `vitest run`, each on the tests
// that suit it — a live demonstration of the dual-engine product:
//
//   • native (the zero-config default) — renders REAL React Native. Use it for
//     component and integration tests: render, query, fire events, assert.
//     See __tests__/native/.
//
//   • mock (opt-in escape hatch) — a fast, deterministic JS reimplementation of
//     RN. Use it when you want to drive the environment (flip Platform.OS,
//     resize the screen, toggle color scheme) or spy on native methods.
//     See __tests__/mock/.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [reactNative()],
        test: {
          name: 'native',
          include: ['__tests__/native/**/*.test.{ts,tsx}'],
        },
      },
      {
        plugins: [reactNative({ engine: 'mock' })],
        test: {
          name: 'mock',
          include: ['__tests__/mock/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
