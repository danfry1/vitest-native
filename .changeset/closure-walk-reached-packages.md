---
"vitest-native": patch
---

**The native engine compiles the dependencies of every package a test run reaches, including one only another workspace member declares and one named in `transform: [...]`.** In a workspace where the app declares `expo` and a library declares only `expo-image`, the library's tests compiled `expo` but not `expo-asset` or `expo-constants`, and failed with `Cannot find module 'expo-asset/build/Asset.fx'`. A package listed in `transform` also lost its dependencies: `react-native-flash-message` left `react-native-iphone-screen-helper` uncompiled, so its `Platform` was `undefined`. Entries added to `transform` only to work around this can be removed.

One case needs action: if a newly compiled dependency is also in your `test.server.deps.inline`, startup now stops with `INLINE_BREAKS_OWNERSHIP`, because Vite and Node would both load it. Remove that package from `server.deps.inline`. Peer dependencies are followed only into packages already detected, and a package that an active preset shadows, or that `transform.exclude` names, is not walked.
