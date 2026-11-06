---
"vitest-native": patch
---

**A test file that fails because a module does not compile now names that module's file, line and column.** A decorator or other syntax that reached Node uncompiled failed the file with only `SyntaxError: Invalid or unexpected token`. The report now reads `SyntaxError: Invalid or unexpected token (src/model/Subscription.js:24:3)` and shows the source line, mapped through the module's sourcemap. No action needed. A project that sets its own `test.runner` keeps Vitest's message.
