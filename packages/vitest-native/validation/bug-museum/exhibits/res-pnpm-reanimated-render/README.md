# Reanimated in a pnpm store resolves its web build

- **Class:** transform/resolution
- **Source:** #349
- **Fixed by:** #349 (`origin/fix/library-resolver-pnpm-store`)
- **Needs:** layout pnpm

## The bug

The same substring check (#349) matches reanimated's OWN store directory, which pnpm names after its worklets peer, so every reanimated file resolved its web variant, importing react-native-web.

## Expected behaviour

Reanimated renders an animated style from a pnpm-shaped store.

## Notes

The buggy side IS shown locally: main fails with the bug's own signature (reanimated resolves react-native-web). The passing side needs a real pnpm install (fixVerification in exhibits.json); res-pnpm-native-ext-peer shows #349 passing locally for the same mechanism.
