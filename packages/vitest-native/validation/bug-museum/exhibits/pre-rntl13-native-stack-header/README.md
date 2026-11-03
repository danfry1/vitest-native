# The native-stack header on RNTL 13 (a test must read the host tree)

- **Class:** harness
- **Source:** #341 (CI caught it on RNTL 12/13)
- **Fixed by:** #341 (merged)
- **Needs:** rntl 13

## The bug

The header fix (#341) was first tested with `getByTestId(...).children[1].type`, which on RNTL 12/13 is the forwardRef ELEMENT, not the host name: green on RNTL 14, red in CI's RNTL 12/13 cells. This exhibit holds the fix on RNTL 13 through the host tree (`toJSON()`), the version-portable shape.

## Expected behaviour

With `navigation: false` (a real React Navigation) and the screens preset on, the native-stack header renders headerLeft: `Go back` is queryable.
