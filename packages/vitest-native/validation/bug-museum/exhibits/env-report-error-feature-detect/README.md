# A global reportError makes feature-detecting libraries fail the run

- **Class:** env-contract
- **Source:** #343 adversarial review (a regression of #343's first version)
- **Fixed by:** #343 (final version) (`origin/fix/recoverable-errors-and-expo-os`)
- **Needs:** nothing beyond this repository's install
- **Bug build:** `da5cd6c` (has the bug; see STATUS.md)

## The bug

#343's first version defined `globalThis.reportError` for the whole run, routing non-React reports to `process.emit('uncaughtException')`. A library that feature-detects `reportError` (as browsers and React do) and reports a handled error through it then failed the run with an unhandled error, where Node and Jest have no `reportError` and the library falls back to `console.error`. The final #343 defines it only while react-test-renderer's bundle evaluates.

## Expected behaviour

A library that reports a handled error through `reportError` when it exists, else `console.error`, does not fail the run.
