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

- **81 / 81 probes** match between the mock engine and real React Native (this page was generated against React Native 0.86.0).
- CI runs the same corpus across **React Native 0.81–0.86** on every commit.
- Per-version results straight from the CI matrix: [Fidelity Matrix](/guide/fidelity-matrix).
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
| `animated-interpolation-live-style` | ✅ match |
| `animated-scrollview-renders` | ✅ match |
| `animated-setvalue-updates-rendered-style` | ✅ match |
| `animated-surface` | ✅ match |
| `animated-text-renders` | ✅ match |
| `animated-transform-live-style` | ✅ match |
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
| `hunt-fireevent-press` | ✅ match |
| `hunt-pressable-children-fn` | ✅ match |
| `hunt-pressable-disabled-a11ystate` | ✅ match |
| `hunt-pressable-press-in-out` | ✅ match |
| `hunt-pressable-style-fn` | ✅ match |
| `hunt-processcolor-edge` | ✅ match |
| `hunt-stylesheet-flatten-direct-falsy` | ✅ match |
| `hunt-textinput-maxlength` | ✅ match |
| `i18nmanager-isrtl` | ✅ match |
| `image-render` | ✅ match |
| `keyboardavoidingview-children` | ✅ match |
| `layout-animation-presets` | ✅ match |
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

## Not gated by the cross-check

Some behaviors are deliberately left out of the gated corpus above because they
vary by React Native version, test environment, or device — a single fixed value
can't be correct for all of them, so pinning one would make the cross-check lie.
They are documented here rather than hidden.

| Area | Behavior | Why it isn't gated |
| --- | --- | --- |
| Default device metrics (Dimensions / PixelRatio) | The default window/screen size, pixel ratio and font scale are a fixed test-host default. Both engines report the same default — the cross-check gates that — but it is not any specific physical device. | Device metrics aren't behavior, and the default won't match a real device. Tests that depend on exact metrics should set them explicitly (e.g. Dimensions.set) rather than rely on the default. |
| Text onPress accessibilityRole | A &lt;Text&gt; with an onPress handler is auto-assigned accessibilityRole "link" by some React Native versions and not others. | Version-variant across the supported RN range — a single mock value can't match every minor, so it isn't pinned by a probe. |
| Appearance color scheme | Appearance.getColorScheme() reflects the host environment rather than a fixed value. | Environment-dependent (CI vs local, OS settings), so it isn't a stable cross-engine invariant to gate. |
| AppState.currentState | The mock engine reports "active" (a foregrounded app). Real React Native running under Node reports undefined, because it reads the value from a native module that only exists on a device — as it also does under Jest with React Native's own preset. | Not a cross-engine invariant: the value exists only because a device exists, the same case as the default device metrics above. The mock's value is pinned by its own suite so it cannot drift unnoticed; tests that branch on foreground state should set it explicitly rather than rely on either default. |
| Animated.getValue() | The mock engine adds a getValue() convenience reader to animated nodes. Real React Native exposes only the internal __getValue(), so the same call throws under engine:native. | Kept for suites already using it, and it now warns once per process pointing at __getValue(), which works under both engines. Removing it is a breaking change and belongs in a major. Every other difference in the Animated surface has been closed: the mock now implements Animated.Node, Animated.Event, Animated.Interpolation, attachNativeEvent, Value.track/stopTracking/animate, hasListeners and toJSON, and stopAnimation/resetAnimation moved off the shared base class to Value and Color, where React Native has them. |
| Host component names and snapshots | The mock engine renders host elements under their JavaScript component name — View, Text, TextInput — while real React Native uses the native view name: RCTView, RCTText. Real React Native also attaches props the mock leaves unset (a Text host carries allowFontScaling, ellipsizeMode and a style array beginning with { overflow: "hidden" }). | React Native Testing Library detects host component names at runtime, so queries, matchers and fireEvent behave identically either way and the corpus above verifies that. SNAPSHOTS DO NOT TRANSFER: the serializer prints the host name and the props verbatim, so a snapshot recorded under one engine fails under the other. Record snapshots under the engine the suite runs on, and re-record when switching. |
