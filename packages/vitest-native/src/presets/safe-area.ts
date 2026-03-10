import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

export function safeAreaContext(): Preset {
  return {
    name: "safeAreaContext",
    modules: {
      "react-native-safe-area-context": {
        exports: [
          "SafeAreaProvider",
          "SafeAreaView",
          "SafeAreaInsetsContext",
          "SafeAreaFrameContext",
          "useSafeAreaInsets",
          "useSafeAreaFrame",
          "withSafeAreaInsets",
          "initialWindowMetrics",
          "initialWindowSafeAreaInsets",
          "EdgeInsets",
          "Rect",
          "Metrics",
        ],
        factory: () => {
          const defaultInsets = { top: 47, right: 0, bottom: 34, left: 0 };
          const defaultFrame = { x: 0, y: 0, width: 390, height: 844 };

          // Mutable state so setInsets() can change it between tests
          const state = {
            insets: { ...defaultInsets },
            frame: { ...defaultFrame },
          };

          const initialMetrics = {
            frame: state.frame,
            insets: state.insets,
          };

          const SafeAreaProvider = React.forwardRef((props: any, ref: any) =>
            React.createElement("SafeAreaProvider", { ...props, ref }, props.children),
          );
          SafeAreaProvider.displayName = "SafeAreaProvider";

          const SafeAreaView = React.forwardRef((props: any, ref: any) =>
            React.createElement("SafeAreaView", { ...props, ref }, props.children),
          );
          SafeAreaView.displayName = "SafeAreaView";

          const SafeAreaInsetsContext = React.createContext(state.insets);
          const SafeAreaFrameContext = React.createContext(state.frame);

          function useSafeAreaInsets() {
            return state.insets;
          }

          function useSafeAreaFrame() {
            return state.frame;
          }

          function withSafeAreaInsets(WrappedComponent: any) {
            const WithSafeAreaInsets = React.forwardRef((props: any, ref: any) =>
              React.createElement(WrappedComponent, {
                ...props,
                ref,
                insets: state.insets,
              }),
            );
            WithSafeAreaInsets.displayName = `withSafeAreaInsets(${WrappedComponent.displayName || WrappedComponent.name || "Component"})`;
            return WithSafeAreaInsets;
          }

          return {
            default: { SafeAreaProvider, SafeAreaView },
            SafeAreaProvider,
            SafeAreaView,
            SafeAreaInsetsContext,
            SafeAreaFrameContext,
            useSafeAreaInsets,
            useSafeAreaFrame,
            withSafeAreaInsets,
            initialWindowMetrics: initialMetrics,
            initialWindowSafeAreaInsets: state.insets,
            EdgeInsets: vi.fn(),
            Rect: vi.fn(),
            Metrics: vi.fn(),
            /** Internal: update insets. Called by setInsets() helper. */
            _setInsets: (insets: {
              top?: number;
              right?: number;
              bottom?: number;
              left?: number;
            }) => {
              Object.assign(state.insets, insets);
            },
            /** Internal: reset insets to defaults. Called by resetAllMocks(). */
            _reset: () => {
              Object.assign(state.insets, defaultInsets);
              Object.assign(state.frame, defaultFrame);
            },
          };
        },
      },
    },
  };
}
