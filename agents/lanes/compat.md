# Lane: compat

The Jest compatibility layer, library presets, the mock engine and matchers: everything that makes existing React Native tests behave as they do under Jest. **Jest is the oracle.**

**Where to look:** `src/jest-compat/` (`setup`, `node-registry`, `transform`, `root-mocks`), `src/preset-map.ts`, `src/presets/index.ts`, `src/mocks/registry.ts`, `src/rntl-support.mjs`, `src/native/boundary.mjs`, `src/native/library-jest.mjs`, `src/native/jest-resolvers.mjs`.

## Invariants
- **The native boundary is a strict subset of RN's `jest/setup.js`.** (ADR 0012; `boundary.mjs`)
- **Prefer each library's own test support.** Hand-written presets are fallbacks with a drift gate. Corrections are version-ranged deviations with a probe; never edit a library's mock module. (ADR 0012, 0017)
- **Hand `jest` to library support files as a function parameter.** Never set `globalThis.jest`, not even conditionally. (ADR 0011, 0017)
- **Apply a library's Jest resolver only to that library's own files**, with a package-relative basedir. (ADR 0005, 0012)
- **The mock engine's scope is frozen.** Cross-check fixes only. It's never the default, and the probe floor may not shrink. (ADR 0015)
- **`jest.mock` reaches Node `require`, the registry side channel and Vite.** (ADR 0004; `node-registry.mjs`)

## Settled decisions
- No auto-discovery of library test support.
- No codegen TurboModule stubs; keep the regex scan.
- Don't delete the mock engine.
- No public `errors` option.
- **Mocks stay faithful to the platform.** For example, iOS gets no default `accessible`.
- **Presets don't swallow hook errors.** This ships as a minor version.
- **Triage:** a missing public API that real apps call is medium or high priority. A gap in a subset nobody touches is low.

## Conventions
- **Review a preset against the installed library's real source and its own mock.** Changes are additive and keep identities stable.
- **Adding a preset:** export it from `src/presets/index.ts`, map it in `src/preset-map.ts`, and test it in `tests/presets.test.ts`.
- **Adding a mock:** components go in `src/mocks/components/` and APIs in `src/mocks/apis/`. Register each in its barrel file and in `src/mocks/registry.ts`.
- **Every conformance waiver names an `#issue`,** or gives an `n/a (internal | type-only | upstream declaration)` reason.

## Traps
- **Wrappers around Vitest mock APIs must be idempotent** and must not change what the calling API is iterating. A `mockReset` wrapper made `vi.resetAllMocks()` loop forever at 100% CPU.
- **`jestMockTransform` rewrites a literal `jest.mock(`, even in our own `dist`.** Don't name a parameter that.
- **Its queued `vi.*` calls look like pending mocks to `nodeMocks`.** Let jest-compat answer for the files it decided.
- **Vitest fake timers leave `queueMicrotask` real; Jest's don't.**

## Not ours (recognise these and send them back)
- **App tests coupled to Jest's fakes:** `'View'` host names, a 1024-px window, `instanceof View`. The app should query by testID or role. Don't emulate the fake.
- **Partial `jest.mock`s hidden by `lazyImports`.** A plain `require` throws the same error.
- **A `requireActual` spread that needs the worklets Babel plugin**, just as it does under Jest.
- **Snapshots re-recorded under an old bug.** Score against the upstream Jest snapshots.

## Verification
- **Test every mock-API wrapper through `resetAllMocks`, `restoreAllMocks` and `clearAllMocks`,** with a deadline and in a reused worker.
