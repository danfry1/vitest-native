# The engine banner does not name the presets it applies

- **Class:** presets
- **Source:** migration testing (2026-10)
- **Fixed by:** #348 (`origin/fix/navigation-preset-visibility`)
- **Needs:** nothing beyond this repository's install

## The bug

An auto-detected preset replaces a whole library (the navigation preset: NavigationContainer pass-through, navigate = vi.fn(), no onReady). A suite that drove a real navigator broke in ways that pointed nowhere, because nothing said a preset was active.

## Expected behaviour

The one-line engine banner names the presets it applies (here safeAreaContext, which applies under both engines).
