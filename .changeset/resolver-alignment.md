---
"vitest-native": patch
---

Resolve format-only package fields the way Node does, so they load once

The native engine runs two module systems. Vitest forwards `resolve.conditions` to
the worker's Node, so packages using an `exports` map resolve identically on both
sides. Legacy top-level fields have no such bridge: Vite reads `module`, Node reads
`main`, and a package publishing both is loaded twice with separate module-level
state. Nothing fails — a store written through one copy reads back unset through the
other, so values arrive empty and the failure surfaces far from its cause.

A `module` field selects a different FORMAT of the same code, so Vite is now pointed
at `main` for those packages and the pair collapses into a single instance.

A `react-native` field is left exactly as it was. That one selects a different
IMPLEMENTATION — the native build rather than the web build — and Metro resolves it
ahead of `main`, so the engine must too. Aligning it downward would quietly load the
web build, which is a fidelity regression rather than a fix; packages using it stay
split and are reported by the duplicate-instance warning instead.

Packages the engine inlines and transforms are also untouched, since Vite is meant to
own their source.
