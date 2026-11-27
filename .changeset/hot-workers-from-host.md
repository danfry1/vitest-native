---
"vitest-native": minor
---

**The hot runtime picks its worker count from the machine.** With no `maxWorkers` set, it runs one worker per performance core where the operating system reports core classes (macOS on Apple silicon), and four elsewhere, as before. On a Mac with 6 performance and 6 efficiency cores it now runs 6 workers instead of 4; one ~400-file suite ran 18% faster with 6. The memory plan still bounds the count, and the startup line names how it was chosen, for example `workers: 6 (automatic: 6, the host's performance cores; …)`. Set `test.maxWorkers` to choose a count yourself.
