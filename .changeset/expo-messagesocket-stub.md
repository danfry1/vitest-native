---
"vitest-native": minor
---

Stub Expo's dev-server messageSocket under the native engine.

`expo`'s `Expo.fx` requires `async-require/messageSocket` whenever `__DEV__ && globalThis.expo`, and that module throws at load time when the bundle wasn't served over HTTP ("Cannot create devtools websocket connections in embedded environments"). Under the native engine this took down any suite importing an `expo-*` package (e.g. `expo-image`) — the primary blocker for Expo apps. The module's only job is a devtools websocket to a live dev server, an environment that doesn't exist under Node, so it is now stubbed to a no-op via the boundary mechanism — matching Jest's dev-server-layer mocks. All published variants are covered (`build/` output and `src/` TS sources, plain and `.native`), and the `.ts`/`.tsx` require handlers now consult boundary stubs, which previously only `.js` did.

Validated against the obytes Expo template bake-off: the login-form suite (previously import-time dead) now passes, 34/40 → 38/40 overall with the two remaining failures pre-existing and unrelated (bottom-sheet mock completeness).
