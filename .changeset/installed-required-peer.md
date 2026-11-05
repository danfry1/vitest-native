---
"vitest-native": patch
---

**Native engine: a React Native package's required peer that pnpm installs for you, such as expo-router's `expo-linking`, is now compiled.** No action needed. Remove `transform: ['expo-linking']` if you added it for this.

- Before, a required peer that no `package.json` declared stayed uncompiled. It then failed with "Cannot require() ES Module … not yet fully loaded" or "Cannot find module …/Linking.types".
- Optional peers, and peers the package never loads, are still not followed.
