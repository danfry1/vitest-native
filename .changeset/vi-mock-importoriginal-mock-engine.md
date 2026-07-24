---
"vitest-native": patch
---

Fix `importOriginal()` inside a test's own `vi.mock('react-native')` under the mock engine

A test that registered its own `vi.mock('react-native', …)` replaced the registration
the setup file makes, and the factory's `importOriginal()` then resolved to an empty
module. The near-universal spread-and-override form therefore dropped every export
the test did not name:

```ts
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal()),   // was empty
  Alert: { alert: vi.fn() },
}));
// -> No "Platform" export is defined on the "react-native" mock
```

The virtual `react-native` module now re-exports the runtime mock, so
`importOriginal()` returns the full surface and unnamed exports survive.
