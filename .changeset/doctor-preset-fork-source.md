---
"vitest-native": patch
---

**`vitest-native doctor` now warns when a package a preset replaces is installed from a fork.** A preset shadows a package by name, so a git, local-path, tarball or npm-alias install under that name never loads in tests, and whatever the fork adds is `undefined`. Doctor names the source, read from the project's dependencies and top-level overrides, and the opt-out for that one preset, `presets: { <preset>: false }`. Nothing changes at run time. No action needed.
