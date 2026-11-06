---
"vitest-native": minor
---

**Native engine: a file that Vite and Node both load, with both copies in use, is now reported by name, `SOURCE_EVALUATED_TWICE`, instead of silently existing twice.** No action needed. To fail on it, set `reactNative({ ownership: 'error' })`.

- The report names the file, how each side loaded it, and the fix. Exempt a deliberate case with `ownership: { allow: [{ path, reason }] }`.
- `require()` of a CommonJS project file a test already imported now returns that same `module.exports`.

See `docs/ownership-guard.md`.
