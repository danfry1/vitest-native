---
"vitest-native": patch
---

**A setup file inside a workspace library that declares `react-native` runs again under the native engine.** Listing such a library's own file in `test.setupFiles` (for example a sibling package's `vitest.setup.ts`) stopped the run with `MODULE_OWNER_CONFLICT` ("Vite attempted to transform '…/vitest.setup.ts', but the native ownership policy assigns that file to Node"). 0.14.0-rc.11 also hit this for libraries whose `exports` map leaves out `./package.json`. Setup files are now entries owned by Vite, as test files are, while the library's own source stays with Node. No action needed: a `transform.exclude` entry added for the library to work around the error can be removed. Setup files inside `node_modules` are unchanged.
