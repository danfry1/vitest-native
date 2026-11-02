# require() of a CommonJS project file the test imported compiles a second copy

- **Class:** ownership
- **Source:** ownership ledger (#353), found by running the suites under ownership: 'error'
- **Fixed by:** #353 (`origin/feat/fail-closed-ownership`)
- **Needs:** nothing beyond this repository's install

## The bug

jest-compat's registry hands `require()` Vite's instance of a project module the file already imported, so both are one module as under Jest's single registry. It SKIPPED CommonJS that Vite evaluated (its namespace holds `module.exports` as a plain `default` data property), and Node compiled a second copy of the file: `require(x) !== (import x).default`, with two copies of its module state.

## Expected behaviour

`require()` of a CommonJS project file the test imported returns the very `module.exports` the import gave.
