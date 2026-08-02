---
"vitest-native": patch
---

`doctor` reports the run, not the directory it was typed in

Two false reports from a workspace migration.

Peers and engine detection resolved from the working directory. That is frequently
not where the Vitest config lives, and under pnpm a package's node_modules holds only
its declared dependencies — so a hoisted `@react-native/babel-preset` does not
resolve from the package even though the real run finds it. `doctor` announced
"engine 'auto' resolves to MOCK" for a project whose run banner said native.

Resolution still happens from the directory the command was invoked in, which sees
the most: Node resolution walks upward, so that directory already reaches its own
dependencies and everything declared above it. The nearest directory holding both a
Vitest config and a manifest is consulted only when something does not resolve there
— the case where the command was run above the package that declares it — and the
report says when it fell back.

A config that builds on a shared one — common in a workspace — was also reported as
not referencing vitest-native. It legitimately never mentions it, because the plugin
is wired up in the package it extends. That case is now described rather than warned
about, since this cannot tell from the file alone.
