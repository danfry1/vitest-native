---
"vitest-native": patch
---

**`hangTimeout` no longer stops a slow cold start, and its report says what each file was doing.** A file still importing reports no test events, so a cold start longer than the limit was stopped as a hang, naming a file whose imports were only slow. Every module loaded through Vite now counts as progress, so a file stuck in a synchronous loop is still caught. The report gives each file's running test and when it started, or how long ago a worker took the file, and when the last module loaded. No action needed.
