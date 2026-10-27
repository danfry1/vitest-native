/**
 * Each preset against what a suite leaving Jest was written against: the library's own
 * test mock, or, for a library whose mock replaces only its native layer and keeps its
 * real JavaScript (gesture-handler, flash-list), the package's own exports.
 *
 * A name the reference has and the preset does not is `undefined` in a test, which
 * fails at the call site ("X is not a function"). Every such name is listed below with
 * the preset that lacks it, so a new gap fails here, and a listed gap the preset has
 * since filled fails too: the lists only shrink. Names are read from the installed
 * package's files, without running them (esmExportNames, mockModuleExportNames).
 *
 * The unistyles and skia presets have their own gates (unistyles-preset.test.ts, and
 * skia's preset is built from Skia's own mock).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { esmExportNames, mockModuleExportNames } from "../src/presets/esm-export-names.js";
import * as presets from "../src/presets/index.js";
import type { Preset } from "../src/types.js";

const require = createRequire(import.meta.url);
const packageDir = (name: string) => path.dirname(require.resolve(`${name}/package.json`));

type Reference = { kind: "esm" | "mock"; file: string; label: string };

interface Case {
  preset: () => Preset;
  /** The module the preset serves for the package. */
  module: string;
  reference: Reference;
  /** Names the reference has and the preset lacks: open gaps, to be filled. */
  gaps: string[];
}

const mockOf = (pkg: string, file: string, kind: "esm" | "mock"): Reference => ({
  kind,
  file: path.join(packageDir(pkg), file),
  label: `${pkg}/${file}`,
});

const CASES: Record<string, Case> = {
  reanimated: {
    preset: presets.reanimated,
    module: "react-native-reanimated",
    reference: mockOf("react-native-reanimated", "lib/module/mock.js", "mock"),
    // Most of reanimated 4's API beyond the core hooks: layout presets, interpolateColor,
    // clamp, Keyframe, the jest helpers (withReanimatedTimer, getAnimatedStyle) and more.
    gaps: [
      "BaseAnimationBuilder",
      "BounceOutDown",
      "BounceOutLeft",
      "BounceOutRight",
      "BounceOutUp",
      "ComplexAnimationBuilder",
      "DynamicColorIOS",
      "Extrapolate",
      "FlipInXDown",
      "FlipInXUp",
      "FlipInYLeft",
      "FlipInYRight",
      "FlipOutXDown",
      "FlipOutXUp",
      "FlipOutYLeft",
      "FlipOutYRight",
      "GentleSpringConfig",
      "GentleSpringConfigWithDuration",
      "IOSReferenceFrame",
      "InterfaceOrientation",
      "Keyframe",
      "LayoutAnimationConfig",
      "NativeEventsManager",
      "PerformanceMonitor",
      "PlatformColor",
      "Reanimated3DefaultSpringConfig",
      "Reanimated3DefaultSpringConfigWithDuration",
      "ReanimatedLogLevel",
      "ReducedMotionConfig",
      "RollInLeft",
      "RollInRight",
      "RollOutLeft",
      "RollOutRight",
      "ScreenTransition",
      "SensorType",
      "SharedTransitionBoundary",
      "SnappySpringConfig",
      "SnappySpringConfigWithDuration",
      "WigglySpringConfig",
      "WigglySpringConfigWithDuration",
      "ZoomInDown",
      "ZoomInEasyDown",
      "ZoomInEasyUp",
      "ZoomInLeft",
      "ZoomInRight",
      "ZoomInRotate",
      "ZoomInUp",
      "ZoomOutDown",
      "ZoomOutEasyDown",
      "ZoomOutEasyUp",
      "ZoomOutLeft",
      "ZoomOutRight",
      "ZoomOutRotate",
      "ZoomOutUp",
      "advanceAnimationByFrame",
      "advanceAnimationByTime",
      "clamp",
      "configureReanimatedLogger",
      "contrastColor",
      "convertToRGBA",
      "createAnimatedPropAdapter",
      "createCSSAnimatedComponent",
      "createWorkletRuntime",
      "css",
      "cubicBezier",
      "defineAnimation",
      "dispatchCommand",
      "enableLayoutAnimations",
      "executeOnUIRuntimeSync",
      "finishScreenTransition",
      "getAnimatedStyle",
      "getDynamicFeatureFlag",
      "getRelativeCoords",
      "getStaticFeatureFlag",
      "getUseOfValueInStyleWarning",
      "getViewProp",
      "interpolateColor",
      "isColor",
      "isConfigured",
      "isReanimated3",
      "isSharedValue",
      "isWorkletFunction",
      "linear",
      "makeShareableCloneRecursive",
      "processColor",
      "reanimatedVersion",
      "runOnRuntime",
      "setDynamicFeatureFlag",
      "setGestureState",
      "setNativeProps",
      "setUpTests",
      "startMapper",
      "startScreenTransition",
      "steps",
      "stopMapper",
      "useAnimatedSensor",
      "useComposedEventHandler",
      "useEvent",
      "useHandler",
      "useScrollOffset",
      "useScrollViewOffset",
      "useTimestamp",
      "withClamp",
      "withReanimatedTimer",
    ],
  },
  worklets: {
    preset: presets.worklets,
    module: "react-native-worklets",
    reference: mockOf("react-native-worklets", "lib/module/mock.js", "mock"),
    // Runtime and scheduling helpers the preset does not model.
    gaps: [
      "getCurrentThreadId",
      "getUIRuntimeHolder",
      "getUISchedulerHolder",
      "isBundleModeEnabled",
      "runOnRuntimeAsyncWithId",
      "runOnRuntimeSyncWithId",
      "scheduleOnRuntimeWithId",
      "toggleSlowAnimationsOnUIRuntime",
    ],
  },
  "safe-area-context": {
    preset: presets.safeAreaContext,
    module: "react-native-safe-area-context",
    reference: mockOf("react-native-safe-area-context", "lib/module/jest/mock.js", "mock"),
    // The mock passes these through from the real package (jest.requireActual).
    gaps: ["SafeAreaConsumer", "SafeAreaContext", "SafeAreaListener", "useSafeArea"],
  },
  "keyboard-controller": {
    preset: presets.keyboardController,
    module: "react-native-keyboard-controller",
    reference: mockOf("react-native-keyboard-controller", "jest/index.js", "mock"),
    gaps: ["KeyboardEffects"],
  },
  "bottom-sheet": {
    preset: presets.bottomSheet,
    module: "@gorhom/bottom-sheet",
    reference: mockOf("@gorhom/bottom-sheet", "mock.js", "mock"),
    // The mock's older enum names; the preset has the current *_STATUS names.
    gaps: ["ANIMATION_STATE", "KEYBOARD_STATE", "SCROLLABLE_STATE"],
  },
  netinfo: {
    preset: presets.netInfo,
    module: "@react-native-community/netinfo",
    reference: mockOf("@react-native-community/netinfo", "jest/netinfo-mock.js", "mock"),
    gaps: [],
  },
  "gesture-handler": {
    preset: presets.gestureHandler,
    module: "react-native-gesture-handler",
    reference: mockOf("react-native-gesture-handler", "lib/module/index.js", "esm"),
    // The library's mock keeps its real JS, so these are the package's own exports the
    // preset replaces: the v3 hook API, the Legacy* components and the rest.
    gaps: [
      "GestureDetectorType",
      "GestureStateManager",
      "HoverEffect",
      "InterceptingGestureDetector",
      "LegacyBaseButton",
      "LegacyBorderlessButton",
      "LegacyDrawerLayoutAndroid",
      "LegacyFlatList",
      "LegacyPressable",
      "LegacyRawButton",
      "LegacyRectButton",
      "LegacyRefreshControl",
      "LegacyScrollView",
      "LegacySwitch",
      "LegacyText",
      "LegacyTextInput",
      "MouseButton",
      "PointerType",
      "RefreshControl",
      "Switch",
      "TextInput",
      "Touchable",
      "VirtualGestureDetector",
      "legacy_createNativeWrapper",
      "useCompetingGestures",
      "useExclusiveGestures",
      "useFlingGesture",
      "useHoverGesture",
      "useLongPressGesture",
      "useManualGesture",
      "useNativeGesture",
      "usePanGesture",
      "usePinchGesture",
      "useRotationGesture",
      "useSimultaneousGestures",
      "useTapGesture",
    ],
  },
  "flash-list": {
    preset: presets.flashList,
    module: "@shopify/flash-list",
    reference: mockOf("@shopify/flash-list", "dist/index.js", "esm"),
    // Benchmarking helpers.
    gaps: [
      "Cancellable",
      "JSFPSMonitor",
      "autoScroll",
      "useDataMultiplier",
      "useFlatListBenchmark",
    ],
  },
};

function referenceNames({ kind, file }: Reference): string[] {
  const names = kind === "esm" ? esmExportNames(file) : mockModuleExportNames(file);
  return [...new Set(names)].filter((name) => name !== "default" && name !== "__esModule").sort();
}

describe("presets against each library's own mock", () => {
  for (const [name, { preset, module, reference, gaps }] of Object.entries(CASES)) {
    describe(name, () => {
      const served = () => {
        const mod = preset().modules[module];
        if (!mod) throw new Error(`the ${name} preset serves no ${module}`);
        return new Set(mod.exports);
      };

      it(`reads names from ${reference.label}`, () => {
        expect(referenceNames(reference).length).toBeGreaterThan(0);
      });

      it("lacks only the listed names", () => {
        const exports = served();
        const missing = referenceNames(reference).filter((n) => !exports.has(n));
        expect(missing).toEqual([...gaps].sort());
      });
    });
  }
});
