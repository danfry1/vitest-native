---
"vitest-native": patch
---

**An installed React Native package that your app imports without listing it in its dependencies is now one module, not two.** A hoisted package such as react-native-gesture-handler was left to Vite for the test's imports, while Node loaded it again for a `require()` or a library's own Jest setup. Each copy kept its own state, and the `SOURCE_EVALUATED_TWICE` guard reported every file. Installed packages that depend on React Native are now Node's whether or not the app lists them, as listed ones already were. The list is kept between runs and rebuilt after an install. List the package in your `dependencies` to make the dependency explicit.
