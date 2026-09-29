---
"vitest-native": patch
---

Report project-source ownership risks consistently for extensionless and platform-specific Node resolution. The warning now distinguishes resolution from proven execution or duplicate instances, and respects Node-owned, delegated and overridden ownership policies. Resolution warnings remain nonfatal.
