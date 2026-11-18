# A component library built by esbuild with JSX preserved imports as an empty namespace

- **Class:** transform/resolution
- **Source:** a survey of public projects that use vitest-native (a tsup-built primitives library)
- **Fixed by:** the compiled re-export names fix
- **Needs:** nothing beyond this repository's install

## The bug

`museum-badge` is published the way tsup/esbuild publishes many React Native component
libraries: an ES build and a CommonJS build, each with an index that re-exports
`./badge` (`export * from "./badge"`), and modules that keep their JSX. It peers on
react-native, so the engine detects it and compiles it for Node.

The test imports it as a namespace, `import * as Badge from "museum-badge"`. Node builds
that namespace from the compiled index, whose `export *` is Babel's
`Object.keys(_badge).forEach` re-export. For a re-export Node reads the re-exported file
from disk, past the engine's module loader, and the lexer it uses cannot read badge.js's
JSX, so `Root` and `Label` are dropped. The namespace holds only `default`, Vitest takes
it as it is because it has `__esModule`, and `Badge.Root` is undefined: rendering it
fails with "Element type is invalid".

## Expected behaviour

The namespace carries `Root` and `Label`, and `<Badge.Root>` renders.
