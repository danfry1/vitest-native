# A Gesture Handler 3 gesture configured with a shared value crashes

- **Class:** presets
- **Source:** issue #351 (a user's migration: ~50 s under Jest -> ~8 s)
- **Fixed by:** #500 (merged; #499, shared values with listeners)
- **Needs:** nothing beyond this repository's install
- **Bug build:** `400c240^` (has the bug; see STATUS.md)

## The bug

GH 3 accepts shared values in gesture config (`usePanGesture({ enabled: sharedValue })`) and subscribes with `addListener`. The mock's shared value has no `addListener`: `TypeError: sharedValue.addListener is not a function`, uncaught, exit 1 (found as A14 in the #351 review). Main cannot reach this bug: its hand-written Gesture Handler preset has no v3 hooks (`useTapGesture is not a function`, the gap `pre-351-gh3-components` holds), so main reads FAIL (other) here and the bug is shown on `400c240^`, the #351 branch before its listener fix.

## Expected behaviour

A pan gesture enabled by a shared value, composed with a tap, mounts; firing the tap runs its callback once.

## Notes

The fix landed in #500, which runs Gesture Handler and flash-list as themselves. The jest.mock workarounds posted in #351 are not used here: the exhibit asserts the libraries work as installed.
