---
"vitest-native": minor
---

Native engine: Metro-style resolution for externalized node_modules packages, plus navigation route params and jest-compat timer leniency

Vitest externalizes most `node_modules` dependencies (any that Node can import
natively), so they load through Node rather than Vite — and Node's resolver has no
notion of React Native's Metro conventions. The native engine now fills those gaps
for externalized packages:

- **Platform extensions** — `import './x'` resolves `x.native.js` / `x.ios.js` /
  `x.android.js` over the default `x.js`, for any `node_modules` package (matching
  Metro and Vite's behavior for inlined code). Previously only `react-native` and
  packages in `transform` got this, so e.g. `@react-navigation` silently loaded its
  web variant (`useLinking.js`), breaking the navigation lifecycle with no error.
- **Asset imports** — `import icon from './icon.png'` (and other asset extensions)
  resolve to the basename string instead of throwing "Unknown file extension" in
  Node's ESM loader.
- **JSON imports** — `import data from './data.json'` without a `with { type: 'json' }`
  attribute no longer throws `ERR_IMPORT_ATTRIBUTE_MISSING` on Node 22+. The native
  engine injects the attribute so Node's own JSON module loader handles it.

Other changes:

- **`navigation` preset** accepts `defaultRouteParams`, used by the mocked
  `useRoute().params` (and as a `<Screen>`'s fallback params) — so components that
  read route params at mount can be tested without a custom `vi.mock`.
- **jest-compat** `jest.advanceTimersByTime` / `advanceTimersByTimeAsync` are now
  no-ops when fake timers are inactive, matching Jest's lenient behavior (Vitest's
  `vi` throws). This fixes RNTL `userEvent.setup({ advanceTimers })` on suites that
  never enable fake timers. All other `jest` methods continue to forward to `vi`.
