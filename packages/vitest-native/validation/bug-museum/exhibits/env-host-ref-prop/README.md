# Host nodes carry a ref prop, which snapshots print

- **Class:** env-contract
- **Source:** react-native-paper trial (#578)
- **Fixed by:** #585 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

React 19 passes `ref` as a prop to a host component given by its bare name. Text's host (`createReactNativeComponentClass('RCTText')`) reached React that way, so `toJSON()` showed `ref` on it, every snapshot printed `ref={…}`, and a Text ref had no `measure()`.

## Expected behaviour

No host in `toJSON()` has a `ref` prop, and a Text ref has the native methods a View ref has.
