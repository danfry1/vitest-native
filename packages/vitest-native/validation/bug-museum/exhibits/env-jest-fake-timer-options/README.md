# jest.useFakeTimers drops Jest's options

- **Class:** env-contract
- **Source:** monorepo migration report #8
- **Fixed by:** #340 (`origin/fix/jest-compat-fake-timer-options`)
- **Needs:** nothing beyond this repository's install

## The bug

`jest.useFakeTimers({ advanceTimers: true })` passed Jest's options verbatim to `vi.useFakeTimers`, whose sinon config ignores unknown keys: the fake clock stood still and the timer never fired.

## Expected behaviour

Jest's options are translated: with `advanceTimers: true` the fake clock follows real time and a 20 ms timer fires.
