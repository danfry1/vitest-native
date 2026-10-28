import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { builtInPreset } from "./built-in.js";
import { libraryMockModule, type LibraryMock } from "./library-mock.js";

// Under the native engine the module is safe-area-context's own Jest mock
// (`react-native-safe-area-context/jest/mock`, its default export), as a Jest suite
// installs it: the real package, with `useSafeAreaInsets` and `useSafeAreaFrame` as
// mock functions that read the provider's metrics (`<SafeAreaProvider initialMetrics>`)
// and zero insets on a 320x640 frame otherwise. Under the mock engine, and for a
// version without that mock, the module below serves.
const SAFE_AREA_MOCK: LibraryMock = {
  pkg: "react-native-safe-area-context",
  entry: "jest/mock",
  file: "lib/module/jest/mock.js",
  exportKey: "default",
};

export function safeAreaContext(): Preset {
  return builtInPreset({
    name: "safeAreaContext",
    modules: {
      "react-native-safe-area-context": libraryMockModule(SAFE_AREA_MOCK, {
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
          // EdgeInsets, Rect and Metrics are interfaces in the real package, so
          // there is no runtime binding to import. Declaring them made a value
          // import of a type resolve here and fail under Metro.
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
      }),
    },
  });
}
