# Gesture Handler with its preset off loses its own Jest setup

- **Class:** presets
- **Source:** #351 (a user's app on 0.15.0-rc.1)
- **Fixed by:** #685
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine Gesture Handler runs as itself, with the `jestSetup.js` it ships replacing its native module. A project that kept `presets: { gestureHandler: false }` from an older setup, and dropped its own Gesture Handler mocks, lost that setup too: the native module was the engine's generic stub, and Gesture Handler warned `Failed to install UI runtime bindings` as it loaded.

## Expected behaviour

Turning the preset off leaves Gesture Handler's own Jest setup running, as a Jest suite runs it.
