---
"vitest-native": minor
---

Add an experimental `metroConfig` option that reads the project's Metro resolution profile

`reactNative({ metroConfig: true })` evaluates the project's Metro config (or Expo's defaults)
in a short-lived, memory-bounded child process and applies its declarative resolution profile:
source extensions and their order, and asset extensions. Main fields and conditions are
reported under `diagnostics`. `metroConfig: { configFile }` points at a config outside the
project root. A custom `resolver.resolveRequest` is code and does not run under Vitest; the
extensions still apply and one warning names the gap. Default: `false`.
