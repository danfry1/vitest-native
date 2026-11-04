---
"vitest-native": patch
---

**Native engine, `hotRuntime`: a React Native workspace library loaded by Node is now evaluated again for each test file.** It kept the first file's instances, so later files read stale state and `instanceof` failed against their own classes. No action needed.

- A file that does not touch such a library loads exactly what it did before.
