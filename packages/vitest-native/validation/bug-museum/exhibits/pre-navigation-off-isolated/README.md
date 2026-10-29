# presets: { navigation: false } fails in an isolated (pnpm/bun) install

- **Class:** presets
- **Source:** migration testing (2026-10) (found while verifying it)
- **Fixed by:** #348 (`origin/fix/navigation-preset-visibility`)
- **Needs:** nothing beyond this repository's install

## The bug

Turning the navigation preset off runs the real React Navigation, whose native-stack imports @react-navigation/elements and @react-navigation/core. Those are TRANSITIVE dependencies: in an isolated layout (pnpm, bun) they are not in the app's own node_modules, and the closure walk that decides what the engine compiles resolved dependencies from the app instead of from the DECLARING package's directory, so they were never compiled and failed to load. Hoisted (npm) installs hide it.

## Expected behaviour

With `{ navigation: false, screens: false }` a real native-stack renders its screen, with no `transform` workaround.
