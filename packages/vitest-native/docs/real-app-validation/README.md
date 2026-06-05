# Real-app validation: react-native-paper under the native engine

**Date:** 2026-06-05 · **Branch:** `design/dual-engine` · **Result: 32/32 fresh tests green.**

This is the P0 "real-app validation" proof from
[`../roadmap-to-confident-real-app-use.md`](../roadmap-to-confident-real-app-use.md)
(Path 1: write NEW tests against a real app's components, avoiding existing jest-suite coupling).
It is the first time a real, widely-used RN codebase has been exercised through this plugin —
previously all evidence was unit/conformance tests and controlled harnesses.

## Subject

[`react-native-paper`](https://github.com/callstack/react-native-paper) **5.15.1** — Callstack's
Material Design component library (one of the most-used RN UI libs). Tested against its **real
TypeScript source** (`src/index.tsx`), not a pre-built bundle, on **React Native 0.84.1 / React 19**.

## Result

| Suite | Tests | Pass |
|---|---|---|
| `paper.components.test.tsx` | 25 | ✅ 25 |
| `paper.advanced.test.tsx` (Portal/Modal/Dialog/Menu/animation) | 7 | ✅ 7 |
| **Total** | **32** | **✅ 32** |

**Components covered (render + interaction where applicable):** Button, Text, Card (+Title/Content),
Chip (onClose), Appbar (Header/Content), TextInput (onChangeText), Switch, Badge, Banner,
ActivityIndicator, Divider, ProgressBar, Surface, IconButton, FAB, Checkbox, RadioButton (+Group),
Searchbar, Snackbar, List.Item, Avatar.Text, SegmentedButtons, DataTable, ToggleButton, AnimatedFAB,
Portal, Modal, Dialog (+Title/Content/Actions), Menu (+Item, open via state), Tooltip, TouchableRipple.

**Engine:** `engine: 'native'` — real React Native JS runs; only the ~7-module native boundary is
mocked. Paper's third-party native deps were shadowed automatically by the
[native-engine preset mechanism](../roadmap-to-confident-real-app-use.md#p0a-native-engine-presetmock-mechanism--third-party-resolution):
`react-native-reanimated@4.3.1` (+ worklets) and `react-native-safe-area-context@5.7` were
auto-detected and replaced with vitest-native's preset mocks — neither real native runtime loaded.

## Gaps / findings (honest)

**Zero plugin or native-engine failures** across all 32 components, including Portal-based overlays
(Modal/Dialog/Menu) and a reanimated-backed component (AnimatedFAB).

The only failures during authoring were **my own test mistakes against Paper's v5 API**, not plugin
gaps — recorded here for honesty:
1. `HelperText` is not a named export of Paper's index in 5.15 → removed from the test.
2. `Title` / `Paragraph` were removed in Paper v5 (use `<Text variant=…>`) → updated the test.
3. Chip's close button exposes `accessibilityLabel="Close"`, not a `*-close` testID → used `getByLabelText`.

**Environment caveats (not plugin defects):**
- **RNTL must be ≥12.** The checkout shipped `@testing-library/react-native@11.5`, which couples to
  `@jest/globals`. Bumped to `12.9`. This is the known P1 jest-compat item — fresh tests on RNTL ≥12
  need no compat shim.
- **`react-native-paper` aliased to its source.** The validation checkout *is* the paper repo, so
  `import 'react-native-paper'` is a self-import (needs an `exports` field paper lacks) and `lib/`
  wasn't built — so the config aliases the package to `src/index.tsx`. A normal consumer importing the
  published package needs no alias.
- The cosmetic **LogBox `act()` warning** (P2 papercut) prints during interaction tests; it does not
  fail anything.

## Reproduce

The test files + config in this directory are the exact artifacts used (kept as committed reference;
they import `react-native-paper`, so they run inside a paper checkout, not this repo).

```sh
# 1. Get the subject (pinned near RN 0.84)
git clone https://github.com/callstack/react-native-paper /tmp/bakeoff/react-native-paper
cd /tmp/bakeoff/react-native-paper
npm install --ignore-scripts

# 2. Install the shadowed third-party deps + a non-jest-coupled RNTL
npm install -D --ignore-scripts --legacy-peer-deps \
  react-native-reanimated@4.3.1 react-native-worklets \
  react-native-safe-area-context @testing-library/react-native@^12.9.0

# 3. Link the plugin (built: `bun run build` in packages/vitest-native first)
npm install -D --ignore-scripts /path/to/vitest-react-native/packages/vitest-native

# 4. Copy the artifacts from this directory
mkdir vn-paper
cp /path/to/this/dir/paper.components.test.tsx vn-paper/components.test.tsx
cp /path/to/this/dir/paper.advanced.test.tsx   vn-paper/advanced.test.tsx
cp /path/to/this/dir/vitest.paper.mts          .

# 5. Run
npx vitest run --config vitest.paper.mts
# → Test Files 2 passed (2) · Tests 32 passed (32)
```

## Takeaway

A real, third-party-heavy component library runs green under the native engine with **no plugin
changes** — the preset mechanism shadows its native deps automatically. Combined with the
representative-stack proof (`tests-native/reanimated.test.tsx`, `tests-native/third-party-stack.test.tsx`),
this converts the roadmap's "NOT confident yet for a full real app" into evidence that the native
engine handles real app code. Next: a fuller app with navigation graphs + screen flows, and a
pass-rate against an existing (migrated) suite once the P1 jest-compat layer ships.
