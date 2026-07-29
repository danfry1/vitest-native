---
"vitest-native": patch
---

Resolve `.json` imports, and try extensions in Metro's order

The plugin replaces Vite's `resolve.extensions` wholesale with a platform-ordered
list, so anything missing from that list stops resolving. `json` was missing, while
Metro treats it as a source extension — `import config from './config'` next to a
`config.json` worked in the app and failed in the test, with a bare "Cannot find
module".

The order within each platform group was also inverted relative to Metro. Metro's
default `sourceExts` are `["js", "jsx", "json", "ts", "tsx"]`, so it picks `Foo.js`
over `Foo.tsx`; the plugin picked `Foo.tsx`. A project with a compiled file beside
its source therefore tested a different file than it shipped. Both graphs now try
`.<platform>.{js,jsx,json,ts,tsx}`, then `.native.*`, then the bare extensions, which
is Metro's own order.

`.mjs` and `.cjs` remain unresolvable without an explicit extension, matching Metro.

The list was written out twice — once for the Vite graph and once for the Node
graph — with nothing holding the two together; a divergence would have resolved one
file in one graph and a different file in the other for the same import. Both are
now derived from a single definition, and a test asserts they agree.
