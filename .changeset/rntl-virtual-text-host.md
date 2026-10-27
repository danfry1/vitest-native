---
"vitest-native": patch
---

Under the native engine, a nested `<Text>` can be found by its own text with RNTL 12 and 13, as it already could with RNTL 14. Real React Native renders a nested `<Text>` as the host `RCTVirtualText`, which RNTL does not treat as text, so `getByText` matched only the outer text. The native setup registered `RCTVirtualText` only through RNTL 14's list of text hosts; for RNTL 12 and 13, which export only an `isHostText` check, it now extends that check. The mock engine is unaffected.
