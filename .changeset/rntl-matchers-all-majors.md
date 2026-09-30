---
"vitest-native": patch
---

Type React Native Testing Library's matchers on RNTL 12 and 13

`vitest-native/rntl-matchers` imported RNTL's matcher interface from
`dist/matchers/types`, a path that exists only from RNTL 14; RNTL 12 and 13 keep it
under `build/`. On those versions the import resolved to nothing, and under
`skipLibCheck: true` the failure was silent: `toHaveTextContent`, `toBeVisible`,
`toBeDisabled` and the other matchers stayed untyped although the peer range is
`>=12 <15`. The entry now declares the interface itself, taking the element type from
RNTL's public `screen` API, and a test compares its members with the installed RNTL's
on each supported major. Typechecked against RNTL 12.9, 13.3 and 14.0 with Vitest 4
and 5 and TypeScript 6 and 7.
