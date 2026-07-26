---
"vitest-native": patch
---

Report when the precompiled React Native registry cannot be built

The native engine compiles React Native's module graph into a single file, and falls
back to per-file module loading when it cannot. The fallback is correct — tests still
run and no result changes — which is what made it hard to notice: a degraded run
looked exactly like a healthy one, only slower. Measured on this package's own native
suite, roughly 1.4x, and the per-file cost compounds on a larger suite.

Neither failure path said so. The build path logged only under `diagnostics`, which
is off by default, and the cache-directory path returned without a message under any
setting. Both now warn once per distinct cause, naming the cause and stating that
results are unaffected. Setting `VITEST_NATIVE_NO_REGISTRY=1` remains silent, since
that path is a request rather than a failure.
