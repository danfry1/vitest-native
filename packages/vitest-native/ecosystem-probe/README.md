# Ecosystem probe

Not part of the published package, and not run on pull requests.

The repository's own suites test vitest-native against fixtures it controls. This
installs the React Native libraries real applications actually depend on — and the
data-layer libraries their tests are mostly made of — and runs realistic usage against
them with **no configuration**.

It exists because one pass of it found three real defects that every in-repo suite was
green through:

- `react-native-modal` failed with a bare `SyntaxError: Unexpected token '<'`, because
  the untranspiled JSX was in a transitive dependency detection could not see (#143).
- `@react-native-community/netinfo` died at the native-module boundary, where a generic
  stub cannot invent the state object the library reads (#144).
- `doctor` reported a healthy project while six of ten test files failed, because RNTL
  14's `test-renderer` peer was missing (#142).

## Running it

```bash
bun run --filter vitest-native build
npm pack --pack-destination /tmp        # from packages/vitest-native
cd ecosystem-probe && npm install && npm install /tmp/vitest-native-*.tgz && npm test
```

The CI workflow does the same on a schedule and opens a tracking issue on failure.

## Adding to it

A probe should be **realistic usage**, not an import smoke test: render the component
the way a user would, or call the API a user would call. `imagepicker.test.tsx` only
checks that functions exist because the real call opens a native picker; everything
that can render, renders.

Keep the default configuration. If a library needs `transform: [...]` or a manual mock
to pass, that is the finding.
