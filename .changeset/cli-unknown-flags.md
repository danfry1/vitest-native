---
"vitest-native": patch
---

**`vitest-native init`, `doctor` and `migrate` now refuse a flag they do not take, instead of ignoring it.** A typo such as `migrate --wirte` used to run a dry report without saying so; it now exits 1 with `✗ unknown option --wirte for migrate. Valid: --root, --help, --write, --force.` Check scripts that pass extra flags to these commands. Change any misspelled flag to one the error lists.
