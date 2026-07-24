---
"vitest-native": patch
---

Stop the hot runtime's legacy-runner import from breaking on Vitest 5

`hotRuntime`'s test runner imported `vitest/runners` as a fallback for Vitest 4.0.x,
guarded by a runtime check. The guard does not help: a literal specifier is resolved
when the module is transformed, not when the branch runs. Vitest 5 removed that
subpath, so the resolve failed on every test file — and the failure mode was the worst
kind, reporting unhandled errors, running no tests, and still exiting 0.

The fallback specifier is now computed, so it stays invisible to the resolver: Vitest
4.0.x keeps its fallback and Vitest 5 never looks for it.
