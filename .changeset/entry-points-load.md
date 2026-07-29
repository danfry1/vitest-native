---
"vitest-native": patch
---

Gate that every declared entry point actually loads

The published `exports` map declares eleven subpaths, and a test checked that each
one points at a file that exists. Existing is not loading: three of the declared
CommonJS entries throw the moment they are required, and nothing noticed because
nothing ever loaded them.

`./dist/index.cjs` — the package's `main`, and the `require` condition of the root
export — is one of them. The root entry re-exports the presets, every preset imports
`vi` from vitest at module scope, and vitest refuses to be required from CommonJS. So
`const { reactNative } = require("vitest-native")` fails, while the ESM entry the
plugin is normally loaded through works. `./dist/presets.cjs` and `./dist/setup.cjs`
fail for the same reason.

Each declared runtime entry is now imported (or required, by extension) during the
suite. The three that cannot load are listed explicitly with the reason, and one that
starts loading fails as a stale entry, so the list cannot outlive the problem it
describes. Every `vi` call sits inside a preset factory that only runs in a worker, so
moving the import is a fix to how the presets are written rather than to the export
map; it is not part of this change.
