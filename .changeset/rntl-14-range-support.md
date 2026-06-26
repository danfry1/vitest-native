---
"vitest-native": minor
---

Support `@testing-library/react-native` 14 alongside 12 and 13.

RNTL 14 made `render`, `fireEvent`, and `act` asynchronous and reconciles with the new
`test-renderer` (replacing `react-test-renderer`). Two changes make the native engine work
across the full supported peer range (`>=12 <15`) from a single setup:

- Register `RCTVirtualText` as a text host under the native engine. Real React Native renders a
  nested `<Text>` as the host `RCTVirtualText`, which RNTL 14's `test-renderer` did not recognize
  as text — so any composite or nested `<Text>` threw "Text strings must be rendered within a
  `<Text>` component". Nested and composite text now render and match correctly.
- The engine itself is RNTL-version agnostic; the only caller-visible difference is that RNTL 14's
  `render`/`fireEvent`/`act` must be awaited. Awaiting them is back-compatible with RNTL 12/13,
  where the calls are synchronous.

CI now exercises RNTL 12, 13, and 14. Note that RNTL 14 requires Node >= 22.13; on Node 20, use
RNTL 13.
