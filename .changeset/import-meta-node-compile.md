---
"vitest-native": patch
---

**Native engine: a file loaded by Node, such as a React Native workspace library reached through an alias, can now use `import.meta.url`, `import.meta.filename` and `import.meta.dirname`.** Tests that failed with `Cannot use 'import.meta' outside a module` now run. No action needed.

- The three properties get the values Node gives the file, as `babel-plugin-transform-import-meta` gives them under Jest.
- Any other property, such as `import.meta.env`, fails with an error naming it and the file. Add the package to `transform: { exclude: [...] }` so Vite loads it.
