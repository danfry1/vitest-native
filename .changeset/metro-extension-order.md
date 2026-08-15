---
"vitest-native": patch
---

Match Metro's extension-major platform resolution order, verified against real metro-resolver

Platform-file resolution interleaved its candidate extensions platform-major —
every `.ios.*` variant before any `.native.*` before any bare extension. Metro
resolves extension-major: for each source extension in order, it tries the
platform variant, then `.native`, then bare (`.ios.js`, `.native.js`, `.js`,
`.ios.jsx`, …). The difference selects different files when a module mixes
platform variants across extensions: `Foo.native.js` beside `Foo.ios.tsx`
resolves to `.native.js` under Metro — the `js` round finishes before `tsx` is
tried — but resolved to `.ios.tsx` here, so a test could run a different file
than the application ships. One shared list feeds both the Vite graph and the
Node hooks, so the correction applies to both at once.

The order had also been asserted by a unit test whose literals were written from
the implementation — the gate encoded the mistake it existed to catch. The
authority is now external: a differential oracle resolves a 160-case sweep of
mixed platform/extension layouts (plus directory-index and per-extension cases)
through real metro-resolver and through this package's resolver and requires
byte-identical answers. The oracle runs against a pinned metro-resolver in the
PR gate, and the weekly compatibility job bumps metro-resolver@latest alongside
react-native@latest so upstream resolution changes surface as scheduled drift.
Reverting the interleaving fails the oracle on the exact mixed-variant shapes
described above.
