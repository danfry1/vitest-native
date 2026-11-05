---
"vitest-native": patch
---

**Under the native engine, a broken install of Babel's thread now fails the first compile at once, naming the file it could not load.** Before, a missing `babel-worker.mjs`, or one that failed as it loaded, left each compile waiting the full deadline (a minute or more) before a generic "has not answered" error. Each request to Babel's thread now also carries an id, and only the answer with that id ends its wait, so an answer that arrives late can never be read as the next one's. No action needed.
