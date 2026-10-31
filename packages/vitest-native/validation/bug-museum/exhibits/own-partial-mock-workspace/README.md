# A partial mock of a detected workspace React Native package is refused as a cycle

- **Class:** ownership
- **Source:** #345 adversarial review (a regression of #345, not of main)
- **Fixed by:** open (regression guard for #345)
- **Needs:** nothing beyond this repository's install
- **Bug build:** `origin/fix/require-actual-single-graph` (has the bug; see STATUS.md)

## The bug

#345 rewrites `jest.requireActual` of project source to `vi.importActual`, and refuses a factory
that would import its own mocked module (`JEST_MOCK_FACTORY_CYCLE`). It decides "project
source" from `this.resolve().external`, which is never set for SSR externalization, so a
partial mock of an auto-detected workspace React Native package (externalized by the
engine) got a false cycle error. Main runs it correctly; the exhibit guards the fix.

## Expected behaviour

The partial mock works: the real member is real, the mocked member is the mock.
