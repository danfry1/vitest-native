---
"vitest-native": patch
---

**`projectBabel` no longer compiles a file with Babel because a comment in it holds an `@` tag.** A config with legacy decorators sent every file with a `// @ts-ignore` or a JSDoc `@param` through Babel. On one large app, 48 of 64 such files had no decorator. A tag after `//`, on a JSDoc line or inside a `/* … */` on the same line no longer counts. No action needed.
