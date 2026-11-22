# A project's own Reanimated mock needs its Babel worklets plugin applied

- **Class:** transform/resolution
- **Source:** #351 (a user's app on 0.15.0-rc.1)
- **Fixed by:** #597 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

A project mocked Reanimated with a `jest.mock` that spreads `jest.requireActual`, so its components ran Reanimated's real `useAnimatedStyle`, which needs the worklets Babel plugin. The project's `babel.config.js` lists it, as babel-jest applies it, but the engine compiled project source with Oxc only: `useAnimatedStyle was used without a dependency array or Babel plugin`.

## Expected behaviour

The project's Babel config applies to the source that needs the plugin (projectBabel), as under babel-jest.
