# Calling jest.useFakeTimers again keeps the old fake clock

- **Class:** env-contract
- **Source:** #340 adversarial review
- **Fixed by:** #340 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

In Jest each `jest.useFakeTimers()` call installs a FRESH fake clock starting at the real current time (`now ?? getRealSystemTime()`). Under jest-compat a second call kept the previous fake clock, so a test that set an early system time leaked it into the next `useFakeTimers()`.

## Expected behaviour

After `jest.useFakeTimers({ now: 0 })` and a second `jest.useFakeTimers()`, `Date.now()` is the real current time again.
