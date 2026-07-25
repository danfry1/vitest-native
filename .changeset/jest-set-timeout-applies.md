---
"vitest-native": patch
---

`jest.setTimeout(ms)` now applies instead of being ignored

The jest-compat shim stubbed `jest.setTimeout` as a no-op, on the grounds that `vi`
had no equivalent. `vi.setConfig({ testTimeout })` is one, and it applies for the rest
of the file — the same scope Jest gives `jest.setTimeout`, since Vitest resets the
config after each test file.

The no-op did not crash anything, which is what made it costly. A suite opening with
`jest.setTimeout(30000)`, routine for slower React Native suites, silently kept
Vitest's 5s default: its slow tests failed on time while the line meant to prevent
that sat above them. A 6s test under `jest.setTimeout(20000)` failed with "Test timed
out in 5000ms" before this change and passes after it.

A non-numeric argument is still ignored rather than written into the config.
