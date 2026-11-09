---
"vitest-native": patch
---

**Vitest below 5.1.0 now gets one startup warning and a `doctor` entry, naming the bug it avoids.** With Vite 8.3.5 or later, Vitest 5.0.x can hide a startup error behind "No test files found" and a formatter crash (vitest-dev/vitest#11682, fixed in 5.1.0). Vitest 5.0.x still runs: 5.1.0 is the recommended version, and 5.0.0 stays the minimum. Upgrade Vitest to 5.1.0 or later to avoid it.
