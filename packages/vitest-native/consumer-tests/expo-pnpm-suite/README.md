# Expo pnpm suite

A pnpm workspace (isolated layout) installed from the packed tarball, run by
`scripts/test-consumers.mjs` (`VN_CONSUMERS=expo-pnpm-suite`) on Expo SDK 58 and, with the
expo-sdk57 fixture's pins, SDK 57.

| Package            | Shape                                                                                                                                                                                                                                      | Run                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `apps/mobile`      | Expo app: expo-router `app/` routes, reanimated + worklets + gesture-handler, an MSW setup file                                                                                                                                            | per-file and `hotRuntime: 'auto'`, iOS and Android, a warm second run, the router suite with jest-compat |
| `packages/ui`      | Workspace library: declares only `expo-image`, a `react-native` peer, an `exports` map without `./package.json`, and a `vitest.setup.ts` other packages share                                                                              | its own suite, from inside it                                                                            |
| `packages/feature` | Workspace package: lists `packages/ui/vitest.setup.ts` in `setupFiles`, imports `packages/ui/src` through `resolve.alias`, aliases into `packages/tokens` without declaring it, and reaches `expo` only through `@suite/ui`'s `expo-image` | its own suite, from inside it                                                                            |
| `packages/tokens`  | Sibling source with a `react-native` peer, reached only through an alias                                                                                                                                                                   | —                                                                                                        |

The shapes come from real monorepos: shared setup files, aliases into workspace source, and
Expo reached only through another package's dependencies.
