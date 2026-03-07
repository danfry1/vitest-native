import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

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
          "withTiming",
          "withSpring",
          "withDecay",
          "withSequence",
          "withDelay",
          "withRepeat",
          "runOnJS",
          "runOnUI",
          "createAnimatedComponent",
          "Easing",
          "FadeIn",
          "FadeOut",
          "SlideInRight",
          "SlideOutLeft",
          "Layout",
          "interpolate",
          "Extrapolation",
          "useAnimatedRef",
          "measure",
          "scrollTo",
          "cancelAnimation",
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

          return {
            default: { createAnimatedComponent },
            useSharedValue,
            useAnimatedStyle,
            useAnimatedProps,
            useDerivedValue,
            useAnimatedScrollHandler,
            useAnimatedGestureHandler,
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
            FadeIn: {
              duration: vi.fn().mockReturnThis(),
              delay: vi.fn().mockReturnThis(),
              build: vi.fn(),
            },
            FadeOut: {
              duration: vi.fn().mockReturnThis(),
              delay: vi.fn().mockReturnThis(),
              build: vi.fn(),
            },
            SlideInRight: { duration: vi.fn().mockReturnThis(), build: vi.fn() },
            SlideOutLeft: { duration: vi.fn().mockReturnThis(), build: vi.fn() },
            Layout: { duration: vi.fn().mockReturnThis(), build: vi.fn() },
            interpolate: vi.fn((_value: number, input: number[], output: number[]) => output[0]),
            Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
            useAnimatedRef: () => React.useRef(null),
            measure: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 })),
            scrollTo: vi.fn(),
            cancelAnimation: vi.fn(),
          };
        },
      },
    },
  };
}
