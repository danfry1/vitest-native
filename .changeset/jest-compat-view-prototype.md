---
"vitest-native": minor
---

**Under jest-compat, `View.prototype` has the native methods, as React Native's Jest preset gives it.** `jest.spyOn(View.prototype, 'measure')` now reaches every `View` ref. It used to fail because React Native's `View` has no prototype. Under the native engine, each native view name now has one host class, so every `View` ref shares the methods a spy replaces.

No action needed. `Text` and `ScrollView` get no prototype.
