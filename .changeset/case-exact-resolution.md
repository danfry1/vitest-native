---
"vitest-native": patch
---

Fix `./App` resolving to `app.json` on macOS and Windows

The React Native CLI template ships `App.tsx` and `app.json` side by side, and its own test
imports `../App`. Metro's extension order tries `.json` before `.tsx`, and macOS and Windows disks
are case-insensitive, so asking whether `App.json` exists answered yes for `app.json`. The template's
test then rendered `{ name, displayName }` and failed with "Element type is invalid … got: object",
while it passes under Jest. Metro resolves from a case-sensitive file map, and Linux CI is
case-sensitive, which is why neither caught it. Extensionless relative imports now match file
names exactly, under both engines.
