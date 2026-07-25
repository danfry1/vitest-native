---
"vitest-native": patch
---

`migrate` no longer emits Jest's `<rootDir>` token into the config it generates

A Jest `setupFiles` or `setupFilesAfterEnv` entry written as `<rootDir>/jest.setup.js`
— the form nearly every real Jest config uses — was copied into the generated Vitest
config verbatim. Vitest does not substitute `<rootDir>`, so it resolved the string as
written and every test file failed to load with
`Cannot find module .../<rootDir>/jest.setup.js`, while the migration report listed
the mapping under "Mapped automatically".

Setup-file paths are now rewritten the same way `moduleNameMapper` targets already
were, as `fileURLToPath(new URL('./jest.setup.js', import.meta.url))`. `testMatch`,
`include` and `moduleNameMapper` already stripped the token; setup files were the one
path that did not.
