---
"vitest-native": patch
---

**`hangTimeout` no longer stops a slow cold start, and its report says which phase each file was in.** A file still importing reports no test events, so a cold start that took longer than the limit (a large graph transforming for the first time, or a hot worker booting under `experimental.ownershipModel`) was stopped as a hang, and the report named a file whose imports were only slow. Every module loaded through Vite now counts as progress, so a file stuck in a synchronous loop is still caught while one that keeps loading is not. The report gives, for each file, the test running and when it started, or how long ago a worker took a file that has not started a test, plus when the last module loaded. No action needed.
