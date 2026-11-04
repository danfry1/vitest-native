---
"vitest-native": patch
---

**Native engine, `hotRuntime`: a workspace library loaded by Node, whether a detected React Native library or one named in `transform`, is now evaluated again for each test file.** It kept the first file's instances, so later files read stale state and `instanceof` failed. No action needed.

- Each file that touches such a library runs it again and holds about its compiled source in memory until the worker recycles, as for an installed package.
