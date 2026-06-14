# Comparison with Jest

Jest with `@react-native/jest-preset` is the React Native standard and works well. This page is an honest account of where vitest-native fits relative to it.

## When to reach for vitest-native

Choose it when you value:

- **Fidelity choice** — Jest always mocks React Native. vitest-native lets you run *real* RN (`engine: 'native'`) when a test needs true behavior, or a fast mock when it doesn't. **This is the differentiator nothing else offers.**
- **DX** — Vitest's watch mode, UI, and native ESM tooling.
- **Unification** — one runner if you also test web or server code with Vitest.

## It is not primarily a speed play

With `engine: 'native'` and isolation on, vitest-native isn't categorically faster than Jest today. Choose it for the **fidelity option and DX** — not raw speed. If a marketing page tells you a real-RN runner is dramatically faster than Jest, be skeptical; this one won't.

## At a glance

|  | vitest-native | Jest + `@react-native/jest-preset` |
|---|---|---|
| React Native | **Real** (native) or fast mock — your choice | Always mocked |
| Runner | Vitest 4+ | Jest |
| Config | One plugin, zero setup | jest-preset + transformIgnorePatterns |
| Watch / UI | Vitest watch + UI | Jest watch |
| ESM | Native | Via transforms |
| Web/server code | Same runner | Separate runner |
| Maturity | Beta | Mature standard |

## The cross-check

The mock engine is a reimplementation of React Native, so it could in principle drift from real RN behavior. vitest-native guards against that with a **CI-gated behavioral cross-check**: the same assertions run against both the mock engine and real RN across React Native 0.81–0.84, and divergences fail CI.

This is the trust mechanism for the mock — and it has already caught and fixed real mock bugs (for example, an `Animated.Text` host-name mismatch that broke `queryByText`, and `Animated.Value`-in-style not resolving for `toHaveStyle`). The native engine doesn't need this — it *is* real RN.

## Migrating

- **New tests** are a drop-in — zero migration cost.
- **An existing, deeply Jest-coupled suite** is incremental, not turnkey. The [jest-compat layer](/guide/jest-compat) clears the mechanical API coupling; the rest is small, well-defined per-suite cleanup. See [Migrating from Jest](/migration/from-jest).
- Coming from the unmaintained `vitest-react-native` plugin? That's a [config swap](/migration/from-vitest-react-native).
