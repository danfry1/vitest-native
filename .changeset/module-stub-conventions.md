---
"vitest-native": patch
---

Fabricated native-module stubs follow Expo method conventions: unknown `*Async` properties resolve a Promise (fixes expo-notifications crashing at import), and unknown PascalCase properties are memoized classes extending `SharedObject` (fixes expo-file-system's `class File extends ExpoFileSystem.FileSystemFile`).
