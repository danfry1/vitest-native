---
"vitest-native": minor
---

Support Vitest 5

The peer range widens from `>=4 <5` to `>=4 <6`. Nothing in the package needed to
change for it: the native engine, the mock engine, the precompiled React Native
registry, the `react-native` facade, and the hot runtime all run unmodified on Vitest
5, including its `@experimental` worker API.

The claim is backed the same way the Vitest 4 support is. The CI matrix gains a
Vitest 5 column — run against the oldest and newest supported React Native, since it
varies the runner rather than RN — and it is blocking, because a declared peer range
is a promise about every release inside it. Each cell runs the native suite stock and
hot plus the mock-vs-real-RN cross-check, exactly as the Vitest 4 columns do.

While 5.x is still prerelease it is reachable only through its `beta` tag; the
repository's install-age policy still applies, so CI resolves the newest beta at least
a week old rather than whatever published that day.
