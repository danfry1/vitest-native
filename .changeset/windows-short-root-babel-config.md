---
"vitest-native": patch
---

**On Windows, app source Node loads is compiled with your Babel config again when the project path has a short (8.3) spelling.** A root such as `C:\Users\RUNNER~1\...`, the default temporary directory on GitHub's Windows runners, did not match the long file names Vite gives, so `require()`d source skipped `babel.config.js` and its presets, macros and plugins, including `babel-preset-expo`. Asset locations had the same mismatch. No action needed.
