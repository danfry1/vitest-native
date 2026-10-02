# Expo

Expo apps run under the default native engine with no Expo-specific package. Expo's own
JavaScript — `expo` itself, expo-router, and the React Navigation stack underneath it — runs for
real, and the auto-detected `expo` preset replaces the native side of the common Expo modules the
way `jest-expo` does.

## Path aliases

Expo resolves the `paths` in `tsconfig.json` by default, so the SDK 57 template imports its own
components as `@/components/…`. vitest-native does the same in an Expo project: on Vite 8 it turns
on Vite's `resolve.tsconfigPaths`. Setting `resolve.tsconfigPaths` yourself takes precedence, and
`experiments.tsconfigPaths: false` in `app.json` turns it off, as it does for Metro. Vite 6 and 7
cannot resolve tsconfig paths; the plugin says so once, and upgrading to Vite 8 or adding the
`vite-tsconfig-paths` plugin resolves them.

## Coming from jest-expo

`vitest-native migrate` reads the Jest configuration and translates the jest-expo preset:

| Jest | vitest-native |
| --- | --- |
| `preset: 'jest-expo'` or `'jest-expo/ios'` | `reactNative()` |
| `preset: 'jest-expo/android'` | `reactNative({ platform: 'android' })` |
| `preset: 'jest-expo/universal'` | one Vitest project per native platform (reported for you to set up) |
| `preset: 'jest-expo/web'`, `'jest-expo/node'` | not React Native renders; keep these suites outside vitest-native |
| jest-expo's setup files | deleted; the plugin installs its own |

jest-expo mocks Expo's native modules but not React Navigation, so a jest-expo suite already renders
its screens inside real navigators. When a `@react-navigation/*` package is installed — which is what
activates vitest-native's navigation preset — `migrate` turns that preset off
(`presets: { navigation: false }`) to keep that behaviour. A project with a root
`__mocks__/@react-navigation` mock keeps the preset, which stands in for that mock.

```sh
npx vitest-native migrate          # report only
npx vitest-native migrate --write  # also save the suggested vitest.config
```

The suggested configuration includes the [jest-compat layer](/guide/jest-compat), so `jest.mock`,
`jest.fn` and `jest.useFakeTimers` in existing suites keep working while you migrate. See
[Migrating from Jest](/migration/from-jest) for the rest of the report.

## Testing expo-router screens

expo-router's own testing library works as its documentation shows:

```tsx
import { renderRouter, screen, testRouter } from 'expo-router/testing-library'
import { expect, test } from 'vitest'

test('navigates between file-based routes', () => {
  renderRouter('./app', { initialUrl: '/' })
  expect(screen).toHavePathname('/')

  testRouter.push('/details/42')
  expect(screen.getByText('details for 42')).toBeTruthy()
})
```

The library is written for Jest — it calls `jest.useFakeTimers` and `jest.mock` itself — so it needs
the [jest-compat layer](/guide/jest-compat), which a migrated configuration already includes:

```ts
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'
import { jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'

export default defineConfig({
  plugins: [reactNative(), jestMockTransform()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [jestCompatSetup],
  },
})
```

From SDK 57, expo-router bundles its own React Navigation, which runs for real. Before SDK 57 it
used the installed `@react-navigation/*` packages; there, add `presets: { navigation: false }` so the
router's navigators are real rather than the navigation preset's mocks.

## What the expo preset covers

The `expo` preset is applied when `expo-constants` is installed. It covers `expo-constants`,
`expo-status-bar`, `expo-font`, `expo-asset`, `expo-splash-screen` and `expo-linking`.

Expo modules without a built-in preset (for example `expo-image` or `expo-haptics`) need a `vi.mock`
in a setup file, like any other native library without a preset.

## SDK and React Native versions

Expo SDKs trail React Native. Pin `react-native` to the version your SDK supports rather than the
newest release. SDK 54 (React Native 0.81) and later fall inside the validated React Native range,
0.81–0.87.

CI installs a packed Expo SDK 57 app (React Native 0.86, RNTL 13) from the release tarball on every
change. It runs an Expo module smoke suite, expo-router's testing library against file-based `app/`
routes, and the same router suite under the configuration `migrate --write` generates from a
jest-expo setup.
