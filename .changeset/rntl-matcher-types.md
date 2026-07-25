---
"vitest-native": minor
---

Add `vitest-native/rntl-matchers`: types for React Native Testing Library's matchers under Vitest

RNTL's matchers run correctly under this plugin but had no types for it. RNTL declares
them only for Jest — augmenting the global `jest` namespace and the `@jest/expect`
module — and neither reaches Vitest's `Assertion`. Every `expect(el).toHaveTextContent(...)`,
`toHaveStyle`, `toBeVisible`, `toBeOnTheScreen` and the rest was
`Property 'x' does not exist on type 'Assertion<...>'` for anyone who typechecks, despite
passing at runtime.

Reference the new types entry once, anywhere in the project:

```ts
/// <reference types="vitest-native/rntl-matchers" />
```

or add `"vitest-native/rntl-matchers"` to `compilerOptions.types`.

It is opt-in rather than folded into the main types because
`@testing-library/react-native` is an optional peer. A type import of an absent package
is invisible under `skipLibCheck: true`, React Native's own default, but reports `TS2307`
under `skipLibCheck: false` — which would break projects using the mock engine without
RNTL. A project that references nothing loads nothing: the file is not part of the
TypeScript program unless asked for.
