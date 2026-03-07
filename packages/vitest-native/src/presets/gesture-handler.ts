import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

export function gestureHandler(): Preset {
  return {
    name: "gestureHandler",
    modules: {
      "react-native-gesture-handler": {
        exports: [
          "State",
          "Directions",
          "Gesture",
          "GestureDetector",
          "GestureHandlerRootView",
          "Swipeable",
          "DrawerLayout",
          "gestureHandlerRootHOC",
          "PanGestureHandler",
          "TapGestureHandler",
          "LongPressGestureHandler",
          "PinchGestureHandler",
          "RotationGestureHandler",
          "FlingGestureHandler",
          "ForceTouchGestureHandler",
          "NativeViewGestureHandler",
          "ScrollView",
          "FlatList",
          "TouchableOpacity",
          "TouchableHighlight",
          "TouchableWithoutFeedback",
          "TouchableNativeFeedback",
        ],
        factory: () => {
          const State = {
            UNDETERMINED: 0,
            FAILED: 1,
            BEGAN: 2,
            CANCELLED: 3,
            ACTIVE: 4,
            END: 5,
          };

          const Directions = {
            RIGHT: 1,
            LEFT: 2,
            UP: 4,
            DOWN: 8,
          };

          function createGestureHandler(name: string) {
            const Handler = React.forwardRef((props: any, ref: any) =>
              React.createElement(name, { ...props, ref }, props.children),
            );
            Handler.displayName = name;
            return Handler;
          }

          const GestureHandlerRootView = React.forwardRef((props: any, ref: any) =>
            React.createElement("GestureHandlerRootView", { ...props, ref }, props.children),
          );
          GestureHandlerRootView.displayName = "GestureHandlerRootView";

          const Swipeable = React.forwardRef((props: any, ref: any) =>
            React.createElement("Swipeable", { ...props, ref }, props.children),
          );
          Swipeable.displayName = "Swipeable";

          const DrawerLayout = React.forwardRef((props: any, ref: any) =>
            React.createElement("DrawerLayout", { ...props, ref }, props.children),
          );
          DrawerLayout.displayName = "DrawerLayout";

          function gestureHandlerRootHOC(component: any) {
            return component;
          }

          // Gesture API (v2)
          const Gesture = {
            Pan: vi.fn(() => ({
              onStart: vi.fn().mockReturnThis(),
              onUpdate: vi.fn().mockReturnThis(),
              onEnd: vi.fn().mockReturnThis(),
              onFinalize: vi.fn().mockReturnThis(),
              enabled: vi.fn().mockReturnThis(),
              minDistance: vi.fn().mockReturnThis(),
            })),
            Tap: vi.fn(() => ({
              onStart: vi.fn().mockReturnThis(),
              onEnd: vi.fn().mockReturnThis(),
              numberOfTaps: vi.fn().mockReturnThis(),
              enabled: vi.fn().mockReturnThis(),
            })),
            LongPress: vi.fn(() => ({
              onStart: vi.fn().mockReturnThis(),
              onEnd: vi.fn().mockReturnThis(),
              minDuration: vi.fn().mockReturnThis(),
              enabled: vi.fn().mockReturnThis(),
            })),
            Pinch: vi.fn(() => ({
              onStart: vi.fn().mockReturnThis(),
              onUpdate: vi.fn().mockReturnThis(),
              onEnd: vi.fn().mockReturnThis(),
              enabled: vi.fn().mockReturnThis(),
            })),
            Rotation: vi.fn(() => ({
              onStart: vi.fn().mockReturnThis(),
              onUpdate: vi.fn().mockReturnThis(),
              onEnd: vi.fn().mockReturnThis(),
              enabled: vi.fn().mockReturnThis(),
            })),
            Fling: vi.fn(() => ({
              direction: vi.fn().mockReturnThis(),
              onStart: vi.fn().mockReturnThis(),
              onEnd: vi.fn().mockReturnThis(),
              enabled: vi.fn().mockReturnThis(),
            })),
            Simultaneous: vi.fn((..._gestures: any[]) => ({})),
            Exclusive: vi.fn((..._gestures: any[]) => ({})),
            Race: vi.fn((..._gestures: any[]) => ({})),
          };

          const GestureDetector = React.forwardRef((props: any, ref: any) =>
            React.createElement("GestureDetector", { ...props, ref }, props.children),
          );
          GestureDetector.displayName = "GestureDetector";

          return {
            default: { GestureHandlerRootView, State, Directions },
            State,
            Directions,
            Gesture,
            GestureDetector,
            GestureHandlerRootView,
            Swipeable,
            DrawerLayout,
            gestureHandlerRootHOC,
            PanGestureHandler: createGestureHandler("PanGestureHandler"),
            TapGestureHandler: createGestureHandler("TapGestureHandler"),
            LongPressGestureHandler: createGestureHandler("LongPressGestureHandler"),
            PinchGestureHandler: createGestureHandler("PinchGestureHandler"),
            RotationGestureHandler: createGestureHandler("RotationGestureHandler"),
            FlingGestureHandler: createGestureHandler("FlingGestureHandler"),
            ForceTouchGestureHandler: createGestureHandler("ForceTouchGestureHandler"),
            NativeViewGestureHandler: createGestureHandler("NativeViewGestureHandler"),
            ScrollView: createGestureHandler("GH-ScrollView"),
            FlatList: createGestureHandler("GH-FlatList"),
            TouchableOpacity: createGestureHandler("GH-TouchableOpacity"),
            TouchableHighlight: createGestureHandler("GH-TouchableHighlight"),
            TouchableWithoutFeedback: createGestureHandler("GH-TouchableWithoutFeedback"),
            TouchableNativeFeedback: createGestureHandler("GH-TouchableNativeFeedback"),
          };
        },
      },
    },
  };
}
