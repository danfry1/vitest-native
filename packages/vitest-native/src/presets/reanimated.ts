import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Resolve the *active* React Native module — the mock under `engine: 'mock'`
 * (intercepted by the CJS bridge) or real RN under `engine: 'native'` (served by
 * the Node loader hooks). Cached. Lets the reanimated mock's `Animated.View`
 * &co. wrap whichever RN component set is live, so the preset is engine-agnostic.
 */
let _rnCache: Record<string, any> | null = null;
function getRN(): Record<string, any> {
  if (_rnCache) return _rnCache;
  try {
    const base = path.join(process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd(), "package.json");
    _rnCache = createRequire(base)("react-native");
  } catch {
    _rnCache = {};
  }
  return _rnCache!;
}

export function reanimated(): Preset {
  return {
    name: "reanimated",
    modules: {
      "react-native-reanimated": {
        exports: [
          "useSharedValue",
          "useAnimatedStyle",
          "useAnimatedProps",
          "useDerivedValue",
          "useAnimatedScrollHandler",
          "useAnimatedGestureHandler",
          "useAnimatedReaction",
          "useAnimatedKeyboard",
          "useReducedMotion",
          "useFrameCallback",
          "withTiming",
          "withSpring",
          "withDecay",
          "withSequence",
          "withDelay",
          "withRepeat",
          "runOnJS",
          "runOnUI",
          "createAnimatedComponent",
          "View",
          "Text",
          "Image",
          "ScrollView",
          "FlatList",
          "Easing",
          "FadeIn",
          "FadeOut",
          "FadeInDown",
          "FadeInUp",
          "FadeInLeft",
          "FadeInRight",
          "FadeOutDown",
          "FadeOutUp",
          "FadeOutLeft",
          "FadeOutRight",
          "SlideInRight",
          "SlideInLeft",
          "SlideInUp",
          "SlideInDown",
          "SlideOutRight",
          "SlideOutLeft",
          "SlideOutUp",
          "SlideOutDown",
          "ZoomIn",
          "ZoomOut",
          "BounceIn",
          "BounceOut",
          "BounceInDown",
          "BounceInUp",
          "BounceInLeft",
          "BounceInRight",
          "FlipInEasyX",
          "FlipInEasyY",
          "FlipOutEasyX",
          "FlipOutEasyY",
          "LightSpeedInLeft",
          "LightSpeedInRight",
          "LightSpeedOutLeft",
          "LightSpeedOutRight",
          "PinwheelIn",
          "PinwheelOut",
          "StretchInX",
          "StretchInY",
          "StretchOutX",
          "StretchOutY",
          "RotateInDownLeft",
          "RotateInDownRight",
          "RotateInUpLeft",
          "RotateInUpRight",
          "RotateOutDownLeft",
          "RotateOutDownRight",
          "RotateOutUpLeft",
          "RotateOutUpRight",
          "Layout",
          "LinearTransition",
          "SequencedTransition",
          "FadingTransition",
          "JumpingTransition",
          "CurvedTransition",
          "EntryExitTransition",
          "interpolate",
          "Extrapolation",
          "useAnimatedRef",
          "measure",
          "scrollTo",
          "cancelAnimation",
          "makeMutable",
          "SharedTransition",
          "ReduceMotion",
          "KeyboardState",
        ],
        factory: () => {
          function createSharedValue(init: any) {
            const listeners = new Map<number, Function>();
            const sv = {
              value: init,
              get() {
                return sv.value;
              },
              set(value: any) {
                sv.value = typeof value === "function" ? value(sv.value) : value;
                listeners.forEach((fn) => fn(sv.value));
              },
              addListener(id: number, listener: Function) {
                listeners.set(id, listener);
              },
              removeListener(id: number) {
                listeners.delete(id);
              },
              modify(modifier?: Function, forceUpdate?: boolean) {
                if (modifier) modifier(sv.value);
                if (forceUpdate !== false) listeners.forEach((fn) => fn(sv.value));
              },
            };
            return sv;
          }

          function useSharedValue(init: any) {
            const ref = React.useRef(createSharedValue(init));
            return ref.current;
          }

          function useAnimatedStyle(updater: () => any) {
            return updater();
          }

          function useAnimatedProps(updater: () => any) {
            return updater();
          }

          function useDerivedValue(updater: () => any) {
            return createSharedValue(updater());
          }

          function useAnimatedScrollHandler(_handler: any) {
            return vi.fn();
          }

          function useAnimatedGestureHandler(_handler: any) {
            return vi.fn();
          }

          function useAnimatedReaction(
            _prepare: () => any,
            _react: (prepared: any, previous: any) => void,
            _deps?: any[],
          ) {
            // No-op in tests — reaction doesn't fire
          }

          function useAnimatedKeyboard() {
            return {
              state: createSharedValue(0),
              height: createSharedValue(0),
            };
          }

          function useReducedMotion() {
            return false;
          }

          function useFrameCallback(_callback: (info: any) => void, _autostart?: boolean) {
            return {
              setActive: vi.fn(),
              isActive: false,
              callbackId: 0,
            };
          }

          function withTiming(toValue: any, _config?: any, callback?: any) {
            callback?.({ finished: true, current: toValue });
            return toValue;
          }

          function withSpring(toValue: any, _config?: any, callback?: any) {
            callback?.({ finished: true, current: toValue });
            return toValue;
          }

          function withDecay(_config?: any, callback?: any) {
            callback?.({ finished: true, current: 0 });
            return 0;
          }

          function withSequence(...values: any[]) {
            return values[values.length - 1];
          }

          function withDelay(_delay: number, value: any) {
            return value;
          }

          function withRepeat(value: any) {
            return value;
          }

          function runOnJS(fn: Function) {
            return fn;
          }

          function runOnUI(fn: Function) {
            return fn;
          }

          function createAnimatedComponent(component: any) {
            const Animated = React.forwardRef((props: any, ref: any) => {
              return React.createElement(component, { ...props, ref });
            });
            Animated.displayName = `Animated(${component.displayName || component.name || "Component"})`;
            return Animated;
          }

          // Built-in animated components (Animated.View, Animated.Text, …). Each
          // lazily wraps the *active* RN component at render time so it renders
          // through the real RN host under the native engine, or the mock under
          // the mock engine. Resolving lazily (not at factory time) avoids
          // touching RN before the engine's hooks are installed.
          function makeAnimatedHost(name: string) {
            const Comp = React.forwardRef((props: any, ref: any) => {
              const Base = getRN()[name];
              if (!Base) {
                throw new Error(
                  `[vitest-native] reanimated preset: react-native '${name}' is unavailable`,
                );
              }
              return React.createElement(Base, { ...props, ref });
            });
            Comp.displayName = `Animated.${name}`;
            return Comp;
          }

          const View = makeAnimatedHost("View");
          const Text = makeAnimatedHost("Text");
          const Image = makeAnimatedHost("Image");
          const ScrollView = makeAnimatedHost("ScrollView");
          const FlatList = makeAnimatedHost("FlatList");

          // Helper to create chainable layout animation presets
          function createLayoutAnim() {
            const obj: any = {};
            obj.duration = vi.fn().mockReturnValue(obj);
            obj.delay = vi.fn().mockReturnValue(obj);
            obj.easing = vi.fn().mockReturnValue(obj);
            obj.damping = vi.fn().mockReturnValue(obj);
            obj.stiffness = vi.fn().mockReturnValue(obj);
            obj.mass = vi.fn().mockReturnValue(obj);
            obj.overshootClamping = vi.fn().mockReturnValue(obj);
            obj.restDisplacementThreshold = vi.fn().mockReturnValue(obj);
            obj.restSpeedThreshold = vi.fn().mockReturnValue(obj);
            obj.springify = vi.fn().mockReturnValue(obj);
            obj.withCallback = vi.fn().mockReturnValue(obj);
            obj.withInitialValues = vi.fn().mockReturnValue(obj);
            obj.randomDelay = vi.fn().mockReturnValue(obj);
            obj.build = vi.fn();
            return obj;
          }

          return {
            default: { createAnimatedComponent, View, Text, Image, ScrollView, FlatList },
            View,
            Text,
            Image,
            ScrollView,
            FlatList,
            useSharedValue,
            useAnimatedStyle,
            useAnimatedProps,
            useDerivedValue,
            useAnimatedScrollHandler,
            useAnimatedGestureHandler,
            useAnimatedReaction,
            useAnimatedKeyboard,
            useReducedMotion,
            useFrameCallback,
            withTiming,
            withSpring,
            withDecay,
            withSequence,
            withDelay,
            withRepeat,
            runOnJS,
            runOnUI,
            createAnimatedComponent,
            Easing: {
              linear: vi.fn((t: number) => t),
              ease: vi.fn((t: number) => t),
              quad: vi.fn((t: number) => t * t),
              cubic: vi.fn((t: number) => t * t * t),
              bezier: vi.fn(() => (t: number) => t),
              in: vi.fn((fn: Function) => fn),
              out: vi.fn((fn: Function) => fn),
              inOut: vi.fn((fn: Function) => fn),
            },
            // Entering animations
            FadeIn: createLayoutAnim(),
            FadeOut: createLayoutAnim(),
            FadeInDown: createLayoutAnim(),
            FadeInUp: createLayoutAnim(),
            FadeInLeft: createLayoutAnim(),
            FadeInRight: createLayoutAnim(),
            FadeOutDown: createLayoutAnim(),
            FadeOutUp: createLayoutAnim(),
            FadeOutLeft: createLayoutAnim(),
            FadeOutRight: createLayoutAnim(),
            SlideInRight: createLayoutAnim(),
            SlideInLeft: createLayoutAnim(),
            SlideInUp: createLayoutAnim(),
            SlideInDown: createLayoutAnim(),
            SlideOutRight: createLayoutAnim(),
            SlideOutLeft: createLayoutAnim(),
            SlideOutUp: createLayoutAnim(),
            SlideOutDown: createLayoutAnim(),
            ZoomIn: createLayoutAnim(),
            ZoomOut: createLayoutAnim(),
            BounceIn: createLayoutAnim(),
            BounceOut: createLayoutAnim(),
            BounceInDown: createLayoutAnim(),
            BounceInUp: createLayoutAnim(),
            BounceInLeft: createLayoutAnim(),
            BounceInRight: createLayoutAnim(),
            FlipInEasyX: createLayoutAnim(),
            FlipInEasyY: createLayoutAnim(),
            FlipOutEasyX: createLayoutAnim(),
            FlipOutEasyY: createLayoutAnim(),
            LightSpeedInLeft: createLayoutAnim(),
            LightSpeedInRight: createLayoutAnim(),
            LightSpeedOutLeft: createLayoutAnim(),
            LightSpeedOutRight: createLayoutAnim(),
            PinwheelIn: createLayoutAnim(),
            PinwheelOut: createLayoutAnim(),
            StretchInX: createLayoutAnim(),
            StretchInY: createLayoutAnim(),
            StretchOutX: createLayoutAnim(),
            StretchOutY: createLayoutAnim(),
            RotateInDownLeft: createLayoutAnim(),
            RotateInDownRight: createLayoutAnim(),
            RotateInUpLeft: createLayoutAnim(),
            RotateInUpRight: createLayoutAnim(),
            RotateOutDownLeft: createLayoutAnim(),
            RotateOutDownRight: createLayoutAnim(),
            RotateOutUpLeft: createLayoutAnim(),
            RotateOutUpRight: createLayoutAnim(),
            // Layout transitions
            Layout: createLayoutAnim(),
            LinearTransition: createLayoutAnim(),
            SequencedTransition: createLayoutAnim(),
            FadingTransition: createLayoutAnim(),
            JumpingTransition: createLayoutAnim(),
            CurvedTransition: createLayoutAnim(),
            EntryExitTransition: createLayoutAnim(),
            interpolate: vi.fn((_value: number, input: number[], output: number[]) => output[0]),
            Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
            useAnimatedRef: () => React.useRef(null),
            measure: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 })),
            scrollTo: vi.fn(),
            cancelAnimation: vi.fn(),
            makeMutable: vi.fn((init: any) => createSharedValue(init)),
            SharedTransition: {
              duration: vi.fn().mockReturnThis(),
              custom: vi.fn().mockReturnThis(),
              progressAnimation: vi.fn().mockReturnThis(),
              defaultTransitionType: vi.fn().mockReturnThis(),
            },
            ReduceMotion: { System: "system", Always: "always", Never: "never" },
            KeyboardState: { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 },
          };
        },
      },
    },
  };
}
