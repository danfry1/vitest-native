---
"vitest-native": patch
---

**Projects that wait for the same precompiled module registry now share one build.** Vitest starts projects at the same time, so two projects for the same platform on a cold cache each compiled the registry in parallel. Now the second waits for the first project's build. If that build fails, both fall back to per-file loading without compiling again. Projects for different platforms still build their own registries. No action needed.
