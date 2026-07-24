---
"vitest-native": minor
---

Compile React Native packages from `node_modules` automatically

Most of the React Native ecosystem publishes untranspiled source — JSX, Flow, or
TypeScript — assuming Metro will compile it. Node cannot run that, so every project
had to discover its own allowlist one `SyntaxError: Unexpected token '<'` at a time
and maintain it by hand in `transform: [...]`.

`engine: 'native'` now detects those packages: any dependency declaring `react-native`
in **its own** manifest is compiled with the project's React Native Babel preset and
inlined into the test graph. The manifest is the authority rather than a name pattern —
`react-native-*` misses `@gorhom/bottom-sheet` and would wrongly claim `react-native`
itself.

Because those packages land in the graph Vitest owns rather than being externalized,
`vi.mock('the-package')` now reaches them too. Mocking `react-native` itself still does
not change what a library sees — its own imports compile to `require`, which reaches
React Native directly.

Dependencies are read from the project's manifest and every manifest above it, so a
workspace that declares its React Native libraries at the repository root is covered.

Excluded automatically: packages a preset already shadows (their real source never
loads) and the test infrastructure — `@testing-library/react-native` and the renderers,
where a second copy in the graph corrupts rendering. `transform: [...]` keeps its
existing meaning for anything detection misses, and takes precedence over it.
