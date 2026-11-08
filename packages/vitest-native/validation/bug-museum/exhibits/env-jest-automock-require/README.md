# require() gets the real package after a factory-less jest.mock

- **Class:** env-contract
- **Source:** review of #566 (#621)
- **Fixed by:** #621's fix PR
- **Needs:** nothing beyond this repository's install

## The bug

`jest.mock('pkg')` with no factory and no manual mock automocks `pkg` under Jest, for every load in the file. Under jest-compat only the test's imports got Vitest's automock: a `require('pkg')` in the test, or in a package Node loads, got the real package, so a suite that requires its mocked SDKs called the real ones.

## Expected behaviour

`require('pkg')` gets the automocked package, the same instance the test's imports get, as under Jest.
