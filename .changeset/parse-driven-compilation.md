---
"vitest-native": minor
---

Compile what Node cannot run, and nothing else

The native engine decided what to compile by NAME: a package was handed to the React
Native Babel preset because auto-detection or a dependency-closure walk selected it.
That guess was wrong far more often than it was right, and every way of being wrong
looked identical — a parse error deep inside a package the project never mentioned.
Babel's own emitted helpers, Metro's `lru-cache` chain and a pure-ESM validator all
arrived that way, and each was answered by adding another name to exclude.

The file answers precisely. If V8 can parse it, Node can run it, so compiling is
optional; if V8 cannot, Node cannot, so compiling is required — the same question Node
is about to ask, which is what makes it a fact rather than a heuristic. Files selected
for compiling are now parsed first, and only compiled if the parse fails.

What is given up is downleveling for Hermes: `const` to `var`, destructuring lowered.
Measured across React Native's own sources and the installed ecosystem, that is the
whole of what the preset does to a file V8 accepts, and it is behaviour-preserving on
Node — arguably closer to what the package published. `__DEV__` is left standing and
top-level requires are not inlined, so neither observable transform is affected.

**This is a robustness change, not a speed one.** On this repository's native suite
with a cold transform cache it measured 7.68s against 7.35s without the check: React
Native's own sources need compiling either way (440 of 450 fail to parse), so the check
mostly adds work here. The benefit is that a package Node can already run can no longer
reach Babel, whatever put it on the list.

Scoped to script-goal files. A `type: module` package is compiled exactly as before,
because the loader hands those to Node as CommonJS and changing that is an interop
question about named exports and live bindings that a parse cannot answer.

Also adds `transform: { include, exclude }`. `exclude` names packages the engine must
never compile, overriding auto-detection, the closure walk and the built-in lists —
so a project that hits a case the parse check does not cover can unblock itself the
same day instead of waiting for a release. The array form keeps its meaning.
