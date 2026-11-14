---
"vitest-native": patch
---

**When React Native's precompile runs out of time, the error now shows what it was doing.** No action needed. The timeout error said only `compiler exceeded <N>ms`. It now quotes the last ten lines the compile wrote, from stderr, or from stdout when stderr is empty, so a Babel plugin that loops, a module waiting on the network, or a tool prompting for input names itself.
