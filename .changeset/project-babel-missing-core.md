---
"vitest-native": patch
---

**Under the mock engine, a project whose Babel config cannot be applied because `@babel/core` is not installed now says so at startup.** Without it, `projectBabel` could not read the config and silently compiled every file with Oxc, so a plugin a file needs (decorators, a macro) did not run. Add `@babel/core` as a dev dependency, or set `projectBabel: 'never'` to silence the line. The native engine already requires `@babel/core`.
