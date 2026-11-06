---
"vitest-native": patch
---

**`vi.resetAllMocks()` no longer loops forever with a `jest.spyOn` spy under jest-compat.** A spy on an arrow function, or any function `new` cannot construct, put itself back in the set of mocks Vitest was resetting. The reset then never returned and the worker spun at full CPU, most often under the hot runtime, where a spy from an earlier file is still alive. Resetting now ends, and the spy still falls back to its original as before.

No action needed.
