---
"vitest-native": patch
---

Match `transform: [...]` packages by their real location, not by name anywhere in the path

The pattern behind `transform` tested for `/<package-name>/` anywhere in a file's
path, so any **directory** sharing a package's name was treated as that package. A
project folder called `expo`, or a source directory named after the library it
implements, made every file beneath it get compiled and externalized as third-party
source — including, in one case, this package's own runtime, which then failed with
`Vitest cannot be imported in a CommonJS module using require()`.

A file now matches only if it is inside the package's resolved directory, or under
`node_modules/<name>/`. Both rules are needed: the resolved directory covers workspace
and `file:` dependencies, which resolve to a real path with no `node_modules` segment,
while the `node_modules` rule covers additional copies of a package that a single
resolution cannot see.
