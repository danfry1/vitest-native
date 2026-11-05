---
"vitest-native": patch
---

**The published package now holds one copy of each runtime module, and `vitest-native doctor` reads its supported Node range from the installed manifest.** The plugin entry imports the shipped runtime files instead of bundling a second copy of them. No action needed.
