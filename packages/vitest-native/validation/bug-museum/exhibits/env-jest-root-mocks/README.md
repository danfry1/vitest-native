# A root __mocks__ file for a node_modules package is not applied

- **Class:** env-contract
- **Source:** obytes template (#562)
- **Fixed by:** #566
- **Needs:** nothing beyond this repository's install

## The bug

Jest applies `__mocks__/<package>` beside `node_modules` to that package with no `jest.mock()` call. Under jest-compat the real package ran: obytes' `__mocks__/moti.ts` was ignored, and its checkbox tests failed in the real moti.

## Expected behaviour

The manual mock replaces the package, as under Jest.
