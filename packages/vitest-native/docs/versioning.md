# Versioning and stability

This document is the semver contract: what a major, minor, or patch release is allowed to change.

[`release-readiness.md`](./release-readiness.md) is the companion document. It defines what is
*tested* before a release ships. This one defines what is *promised* about the surface those tests
cover.

Until 1.0, the contract below describes intent and is honoured on a best-effort basis; breaking
changes are called out in release notes. **At 1.0 it becomes binding**, and everything in
[Covered surface](#covered-surface) is protected by semver.

## Covered surface

These are the things a major release may break, a minor may only extend, and a patch may not change
at all. Anything not listed here is not covered — see [Outside the contract](#outside-the-contract).

### Entry points

Only the subpaths declared in `exports` are public. Nothing under `dist/` is importable directly,
and deep paths are not supported even when they happen to resolve.

| Subpath | Covered exports |
| --- | --- |
| `vitest-native` | `reactNative`, `presets`, `disabledPresetNames` |
| `vitest-native/helpers` | `setPlatform`, `setDimensions`, `setColorScheme`, `setInsets`, `mockNativeModule`, `resetAllMocks` |
| `vitest-native/presets` | the 17 preset factories, by name |
| `vitest-native/matchers` | `toHaveAnimatedStyle`, `toHaveAnimatedProps`, `animatedMatchers` |
| `vitest-native/serializer` | `serializer` |
| `vitest-native/jest-compat` | `jestMockTransform`, `jestCompatAliases`, `jestCompatSetup` |
| `vitest-native/jest-compat/setup`, `/jest-globals`, `/extend-expect-noop` | loadable as setup-file and alias targets |
| `vitest-native/rntl-matchers` | the RNTL matcher type augmentation |

The module format of an entry point is part of the contract: an entry that is loadable from
CommonJS stays loadable from CommonJS. Which entries those are is enforced by `check:exports`, and
every subpath is loaded by specifier under both `require` and `import` in
`tests/package-exports.test.ts`.

### Plugin options

The keys accepted by the plugin function are `engine`, `platform`, `presets`, `mocks`,
`diagnostics`, `assetExts`, `transform`, `hotRuntime`. Their accepted types and their defaults are
covered. An unknown key is rejected at configuration time, so adding a key is a minor and removing
or renaming one is a major.

`hotRuntime` is the exception — see [Experimental](#experimental).

### Preset authoring

The `Preset` and `PresetModule` types are a public extension point: third-party presets can be
written and passed to `presets: [...]`. Covered: the shape `{ name, modules, config? }`, that
`PresetModule.exports` is read at config time, and that `PresetModule.factory` is called only
inside a Vitest worker.

`factory` may gain optional parameters in a minor, since that does not break an existing
zero-argument factory. Its return type and call site will not change without a major.

### Error codes

Thrown errors carry a stable `code`. The `code` values and the error classes are covered; the
human-readable `message` text is not.

### CLI

The command names `doctor`, `init`, and `migrate`, their documented flags, and their exit codes.
The wording and layout of what they print is not covered.

## Outside the contract

Changing any of these is a patch or minor, and never requires a major.

- **The wording of any message** — diagnostics, warnings, `doctor`/`init`/`migrate` output, and
  error `message` strings. Assert on error `code`, not on text.
- **What a preset mocks.** Presets track upstream libraries. When `react-native-reanimated` adds an
  export, the preset gains it in a minor; when upstream removes one, the preset drops it in a minor.
  The preset's *existence and name* are covered; its mocked surface follows upstream.
- **Mock-engine fidelity details.** The mock engine's job is to match real React Native. A change
  that moves it *closer* to real RN is a fix, even if a test was relying on the divergence. The
  cross-check corpus and `crosscheck/known-differences.json` record where the two intentionally
  differ.
- **Anything reachable only by deep import** into `dist/`.
- **Internal cache layout** under `node_modules/.cache/vitest-native`.

## Experimental

Experimental surfaces are excluded from the contract at every version, including after 1.0. They
are documented, tested, and gated in CI — they are simply not stable, and they say so.

| Surface | Why |
| --- | --- |
| `hotRuntime` and its options | Built on Vitest's experimental custom-pool API, which can change between Vitest minors. Off by default. |

A surface leaves this list by being promoted in a minor, and can change or be removed in a minor
while it is on it.

## Upstream support ranges

`vitest-native` sits between several fast-moving projects — Node, Vite, Vitest, React, React
Native, and React Native Testing Library. Treating every peer-range change as a major would make
the package unable to keep up, which is the main way a tool like this dies. So peer ranges are
handled explicitly:

- **Adding support** for a new upstream version is a **minor**.
- **Dropping a version that upstream has already end-of-lifed** is a **minor**, announced in the
  release notes. The package does not promise to outlive its own dependencies.
- **Dropping a version upstream still supports** is a **major**.
- **Raising the Node floor** is a **minor** when the versions dropped are end-of-life, and a
  **major** otherwise.

The currently supported ranges are in [Requirements](../README.md#requirements) and the blocking
matrix in [`release-readiness.md`](./release-readiness.md#blocking-compatibility-matrix). Those are
the authoritative lists; this document only says how they may move.

## Deprecation

1. A deprecated surface keeps working and gains a runtime warning naming the replacement, plus a
   note in the docs and release notes. This happens in a **minor**.
2. It is removed no earlier than the **next major**.

Something can only be removed without this cycle if it never worked — an entry point that always
threw, for example, is a bug being fixed, not an API being removed.

## What 1.0 means

1.0 is not a statement that the code has stopped changing. It is a statement that:

- the surface above is enumerated, deliberate, and protected by semver;
- the parts that are not stable are labelled, rather than silently included;
- the tests and gates in [`release-readiness.md`](./release-readiness.md) are what stand behind the
  promise, and each one checks the thing it claims to check.

Reaching it does not require new features. It requires the surface to be exactly what this document
says it is.
