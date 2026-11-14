---
"vitest-native": patch
---

**Under the hot runtime, a library that defines a non-configurable global no longer fails every later file in the worker.** No action needed. The reset before each file could not delete such a property (the `openai` SDK defines one for its provider definitions), so it threw `hotRuntime state restoration failed` before every file after the first. A property no reset can delete or replace now stays for the worker's life, as Node's own process-wide state does, and `diagnostics: true` names it. Every other global a file adds is still deleted before the next file.
