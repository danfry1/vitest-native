<!--
  GENERATED FILE — do not edit by hand.
  Regenerate with `bun run fidelity:report`. Source: the behavioral cross-check
  corpus (packages/vitest-native/crosscheck/) and known-differences.json.
-->
# Fidelity report

The `mock` engine is a reimplementation of React Native, so it could in principle
drift from real RN. vitest-native guards against that with a **behavioral
cross-check**: a corpus of probes runs the *same* assertions under the mock engine
**and** under real React Native, and any divergence fails CI. This page is
generated from the corpus itself, so the numbers below are exactly what ships.

## Summary

- **68 / 68 probes** match between the mock engine and real React Native.
- CI runs the same corpus across **React Native 0.81–0.85** on every commit.
- Reproduce it yourself: `bun run crosscheck`.

The `native` engine needs no cross-check — it *is* real React Native.

## Probes

Each probe renders or exercises a real behavior (queries, presses, text input,
lists, scrolling, modals, and core API values) and compares the observable result
across both engines.

| Probe | Result |
| --- | --- |
| `a11y-role` | ✅ match |
| `a11y-state-disabled` | ✅ match |
| `accessibility-label-read` | ✅ match |
| `accessibility-value` | ✅ match |
| `activityindicator-renders` | ✅ match |
| `animated-image-renders` | ✅ match |
| `animated-scrollview-renders` | ✅ match |
| `animated-text-renders` | ✅ match |
| `animated-value-initial-style` | ✅ match |
| `animated-view-renders` | ✅ match |
| `button-renders-title` | ✅ match |
| `button-userpress` | ✅ match |
| `composite-text-match` | ✅ match |
| `controlled-textinput-rerender` | ✅ match |
| `dimensions-window` | ✅ match |
| `flatlist-renders-items` | ✅ match |
| `get-all-by-role-count` | ✅ match |
| `get-by-text-miss-throws` | ✅ match |
| `i18nmanager-isrtl` | ✅ match |
| `image-render` | ✅ match |
| `keyboardavoidingview-children` | ✅ match |
| `matcher-checked-switch` | ✅ match |
| `matcher-contains-element` | ✅ match |
| `matcher-disabled-enabled` | ✅ match |
| `matcher-display-value` | ✅ match |
| `matcher-have-prop` | ✅ match |
| `matcher-on-the-screen` | ✅ match |
| `matcher-style` | ✅ match |
| `matcher-text-content` | ✅ match |
| `modal-visible-children` | ✅ match |
| `nested-text` | ✅ match |
| `not-on-screen-after-unmount` | ✅ match |
| `pixelratio` | ✅ match |
| `pixelratio-rounding` | ✅ match |
| `placeholder-query` | ✅ match |
| `platform-os` | ✅ match |
| `platform-select` | ✅ match |
| `platform-select-partial` | ✅ match |
| `platform-version-type` | ✅ match |
| `pressable-disabled-suppresses-press` | ✅ match |
| `pressable-fires-onpress` | ✅ match |
| `processcolor` | ✅ match |
| `query-all-by-text` | ✅ match |
| `query-by-hint-text` | ✅ match |
| `query-by-label-text` | ✅ match |
| `query-by-role` | ✅ match |
| `query-by-role-name` | ✅ match |
| `query-by-testid-miss` | ✅ match |
| `query-by-text-regex` | ✅ match |
| `scrollview-fireevent-scroll` | ✅ match |
| `sectionlist-render` | ✅ match |
| `stylesheet-create-identity` | ✅ match |
| `stylesheet-flatten` | ✅ match |
| `stylesheet-flatten-falsy` | ✅ match |
| `stylesheet-helpers` | ✅ match |
| `switch-render` | ✅ match |
| `testid-query` | ✅ match |
| `text-numberoflines-prop` | ✅ match |
| `text-renders` | ✅ match |
| `textinput-displayvalue` | ✅ match |
| `textinput-focus-blur` | ✅ match |
| `textinput-onchangetext` | ✅ match |
| `textinput-usertype` | ✅ match |
| `touchable-highlight-onpress` | ✅ match |
| `touchable-opacity-onpress` | ✅ match |
| `touchable-without-feedback-onpress` | ✅ match |
| `view-onlayout` | ✅ match |
| `within-scoping` | ✅ match |

## Known differences

Where the mock engine intentionally or knowingly differs from real React Native,
it is documented here rather than hidden. These are excluded from the probe
corpus above (or asserted to their known values) so the cross-check stays green
without papering over the difference.

| Area | Difference | Why |
| --- | --- | --- |
| Dimensions / PixelRatio defaults | Default device metrics (window/screen size, pixel ratio, font scale) can differ between the mock engine's fixed default device and the metrics real React Native reports in the test host. | These are device/environment values, not behavior. Tests that depend on exact metrics should set them explicitly (e.g. Dimensions.set / a fixed device) rather than rely on a default, so the value is the same under both engines. |
