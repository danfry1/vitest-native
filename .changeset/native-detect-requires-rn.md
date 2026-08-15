---
"vitest-native": patch
---

Engine auto-detection requires react-native itself, not just its Babel toolchain

`engine: 'auto'` chose the native engine whenever `@react-native/babel-preset`
and `@babel/core` resolved — react-native itself was never checked, so an
incomplete install (or a babel-only workspace) selected native mode and then
failed later at React Native resolution with nothing pointing at the cause.

Detection now requires all three. The check resolves rather than reads
declarations — everything is located by walking node_modules upward from the
project root, so a hoisted workspace install or Expo's transitive react-native
counts without appearing in the project's own manifest. The fallback notice and
the explicit-`engine: 'native'` configuration error both name exactly which
dependencies did not resolve.
