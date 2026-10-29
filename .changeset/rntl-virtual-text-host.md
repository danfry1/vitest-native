---
"vitest-native": patch
---

**Under the native engine with RNTL 12 or 13, `getByText` finds a nested `<Text>` by its own text**, as it already did with RNTL 14. No action needed. The mock engine is unaffected.

Real React Native renders a nested `<Text>` as the host `RCTVirtualText`, which RNTL 12 and 13 do not treat as text, so `getByText` matched only the outer text. The native setup now extends their `isHostText` check with it, as it already extended RNTL 14's list of text hosts.

Not covered: role queries on RNTL 12. A nested `<Text accessibilityRole="link">` is still not found by `getByRole("link")` there; RNTL 13 and 14 find it.
