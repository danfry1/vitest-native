# View has no prototype for a jest.spyOn

- **Class:** env-contract
- **Source:** react-native-paper trial (#574)
- **Fixed by:** #594
- **Needs:** nothing beyond this repository's install

## The bug

React Native's Jest preset gives `View` a class stand-in with the native methods on its prototype, and suites spy there. React Native's own `View` has no prototype, so `jest.spyOn(View.prototype, 'measure')` failed: "could not find an object to spy upon".

## Expected behaviour

Under jest-compat, a spy on `View.prototype.measure` reaches every View ref.
