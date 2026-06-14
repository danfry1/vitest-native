# Troubleshooting

## "vitest-native helpers called before setup"

This means the plugin isn't configured. Ensure `reactNative()` is in your `vitest.config.ts` `plugins` array.

## RNTL queries not finding components

Host component names are handled for you — the plugin sets them for older RNTL, and RNTL ≥ 12 auto-detects them against real RN host names. If you're having issues:

1. Make sure `@testing-library/react-native` is installed.
2. **Don't** manually configure `hostComponentNames` — leave it to the plugin / RNTL's auto-detection. Removing a manual config often fixes this.

## Asset imports returning undefined

The plugin stubs common asset extensions (png, jpg, gif, mp4, mp3, ttf, etc.). For custom formats, use [`assetExts`](/guide/plugin-options#assetexts):

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

## "Invalid hook call" warnings in test output

If you call `useColorScheme` or `useWindowDimensions` directly outside a component (e.g. in API tests), you'll see a React warning in stderr. The mock handles this gracefully with a try/catch fallback — **the test still passes**, and the warning is expected.

## `vi.mock` of an RN-side library isn't taking effect

Under `engine: 'native'`, libraries that load through Node (not your Vite source graph) bypass Vitest's mocker. Prefer a [preset](/guide/presets) if one exists, or mock at the native boundary. Your *own* modules mock normally. See [How It Works](/guide/how-it-works#a-consequence-worth-knowing).

## A third-party library ships untranspiled source and fails to parse

Add it to the [`transform` allowlist](/guide/plugin-options#transform) (the native-engine equivalent of Jest's `transformIgnorePatterns`):

```ts
reactNative({ transform: ['some-untranspiled-lib'] })
```

## Snapshots mismatch after switching from Jest

Under `engine: 'native'`, real React Native renders **real host component names** (`RCTText`, `RCTView`, `RCTScrollView`), whereas `@react-native/jest-preset` snapshots show mock names (`Text`, `View`). Run once with `vitest run -u` to re-record. Prefer explicit queries over large snapshots — they're robust across host names. See [Migrating from Jest](/migration/from-jest#re-record-snapshots).

## Still stuck?

If something that worked under Jest or the old `vitest-react-native` plugin doesn't work here, [open an issue](https://github.com/danfry1/vitest-native/issues) — parity is a goal, and the cross-check corpus is how we prove it.
