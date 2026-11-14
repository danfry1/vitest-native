---
"vitest-native": patch
---

**A cancelled run no longer waits for a stopped background build before it exits.** No action needed. On Windows, a cold run cancelled with `--bail` or Ctrl-C could take several more seconds to exit on a busy machine. The background process that precompiles React Native got its input on stdin, and a stop before it had read that input left a write pending that held the run open until Windows finished tearing that process down. Helper processes now read their input from a file in the project's cache directory, which is removed when they end.
