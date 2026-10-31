# RNTL's findBy does not advance Vitest's fake timers

- **Class:** env-contract
- **Source:** migration testing (2026-10)
- **Fixed by:** #374 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

RNTL detects fake timers through a global `jest` (`jest.getRealSystemTime`) and advances them with `jest.advanceTimersByTime`. Without jest-compat there is no global `jest`, so `findBy*` polled in real time while Vitest's fake clock stood still, and timed out.

## Expected behaviour

`findByText` under `vi.useFakeTimers()` advances the fake clock and finds the element, as it does under Jest's fake timers.
