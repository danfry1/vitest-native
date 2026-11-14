---
"vitest-native": patch
---

**A cancelled run no longer waits for a stopped background build before it exits.** No action needed. On Windows, a cold run cancelled with `--bail` or Ctrl-C could take several more seconds to exit on a busy machine: the background build that precompiles React Native had been stopped before it read its input, and the pending write kept the process open until the system finished tearing that process down. Stopping a helper process now closes its pipes at once.
