---
"vitest-native": patch
---

Native engine: a module the require hooks resolve themselves (Metro's platform-extension scan, the project's aliases, React Native's deep paths) is now keyed by its real path, as Node keys its own resolutions. A file reached through a symlink, or on Windows an alias target written with `/`, loaded a second time and gave two instances of one module.
