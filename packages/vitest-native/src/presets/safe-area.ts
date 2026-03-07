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
          const initialMetrics = {
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 47, right: 0, bottom: 34, left: 0 },
          };

          const SafeAreaProvider = React.forwardRef((props: any, ref: any) =>
            React.createElement("SafeAreaProvider", { ...props, ref }, props.children),
          );
          SafeAreaProvider.displayName = "SafeAreaProvider";

          const SafeAreaView = React.forwardRef((props: any, ref: any) =>
            React.createElement("SafeAreaView", { ...props, ref }, props.children),
          );
          SafeAreaView.displayName = "SafeAreaView";

          const SafeAreaInsetsContext = React.createContext(initialMetrics.insets);
          const SafeAreaFrameContext = React.createContext(initialMetrics.frame);

          function useSafeAreaInsets() {
            return initialMetrics.insets;
          }

          function useSafeAreaFrame() {
            return initialMetrics.frame;
          }

          function withSafeAreaInsets(WrappedComponent: any) {
            const WithSafeAreaInsets = React.forwardRef((props: any, ref: any) =>
              React.createElement(WrappedComponent, {
                ...props,
                ref,
                insets: initialMetrics.insets,
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
            initialWindowSafeAreaInsets: initialMetrics.insets,
            EdgeInsets: vi.fn(),
            Rect: vi.fn(),
            Metrics: vi.fn(),
          };
        },
      },
    },
  };
}
