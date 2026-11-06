# A jest.mock factory's require of project source loads a second copy

- **Class:** ownership
- **Source:** Bluesky trial (#571)
- **Fixed by:** #580
- **Needs:** nothing beyond this repository's install

## The bug

A factory runs while the first import is evaluated, before Vite has reached the source it requires, so a synchronous `require` loaded that source, and everything it imports, through Node. The test's import and the mock then held different copies of the same store (Bluesky: 657 files evaluated twice).

## Expected behaviour

The factory's `require` gets the instance the test imports.
