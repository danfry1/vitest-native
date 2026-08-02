import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

export function expo(): Preset {
  return {
    name: "expo",
    modules: {
      "expo-constants": {
        // expo-constants exports three enums and a default object. `expoConfig`,
        // `isDevice` and the rest are properties OF that default — never named
        // exports — so declaring them here made `import { isDevice }` resolve in a
        // test and fail under Metro.
        exports: ["AppOwnership", "ExecutionEnvironment", "UserInterfaceIdiom"],
        factory: () => {
          const AppOwnership = { Expo: "expo" } as const;
          const ExecutionEnvironment = {
            Bare: "bare",
            Standalone: "standalone",
            StoreClient: "storeClient",
          } as const;
          const UserInterfaceIdiom = {
            Handset: "handset",
            Tablet: "tablet",
            Desktop: "desktop",
            TV: "tv",
            Unsupported: "unsupported",
          } as const;

          const Constants = {
            expoConfig: {
              name: "test-app",
              slug: "test-app",
              version: "1.0.0",
              extra: {},
            },
            executionEnvironment: "storeClient",
            appOwnership: "standalone",
            isDevice: true,
            platform: {},
            manifest: null,
            manifest2: null,
            expoGoConfig: null,
            easConfig: null,
            experienceUrl: "",
            linkingUri: "",
            getWebViewUserAgentAsync: vi.fn(async () => "test-user-agent"),
          };

          return {
            default: Constants,
            AppOwnership,
            ExecutionEnvironment,
            UserInterfaceIdiom,
          };
        },
      },

      "expo-font": {
        exports: ["useFonts", "loadAsync", "isLoaded"],
        factory: () => {
          const useFonts = vi.fn(() => [true, null]);
          const loadAsync = vi.fn(async () => {});
          const isLoaded = vi.fn(() => true);

          const exports = {
            useFonts,
            loadAsync,
            isLoaded,
          };

          return {
            ...exports,
            default: exports,
          };
        },
      },

      "expo-asset": {
        exports: ["Asset"],
        factory: () => {
          const Asset = {
            fromModule: vi.fn((moduleId: any) => ({
              uri: `asset://${moduleId}`,
              localUri: `asset://${moduleId}`,
              width: 100,
              height: 100,
              name: "mock-asset",
              type: "png",
              downloadAsync: vi.fn(async () => {}),
            })),
            loadAsync: vi.fn(async () => {}),
          };

          return {
            default: { Asset },
            Asset,
          };
        },
      },

      "expo-splash-screen": {
        exports: ["preventAutoHideAsync", "hideAsync"],
        factory: () => {
          const preventAutoHideAsync = vi.fn(async () => true);
          const hideAsync = vi.fn(async () => true);

          const exports = {
            preventAutoHideAsync,
            hideAsync,
          };

          return {
            ...exports,
            default: exports,
          };
        },
      },

      "expo-linking": {
        exports: ["createURL", "parse", "useURL"],
        factory: () => {
          const createURL = vi.fn((path: string) => `exp://localhost:19000/${path}`);
          const parse = vi.fn((url: string) => ({
            scheme: "exp",
            hostname: "localhost",
            path: url,
            queryParams: {},
          }));
          const useURL = vi.fn(() => null);

          const exports = {
            createURL,
            parse,
            useURL,
          };

          return {
            ...exports,
            default: exports,
          };
        },
      },

      "expo-status-bar": {
        exports: [
          "StatusBar",
          "setStatusBarStyle",
          "setStatusBarHidden",
          "setStatusBarBackgroundColor",
          "setStatusBarTranslucent",
          "setStatusBarNetworkActivityIndicatorVisible",
        ],
        factory: () => {
          const StatusBar = React.forwardRef((props: any, ref: any) =>
            React.createElement("StatusBar", { ...props, ref }, props.children),
          );
          StatusBar.displayName = "StatusBar";

          const setStatusBarStyle = vi.fn();
          const setStatusBarHidden = vi.fn();
          const setStatusBarBackgroundColor = vi.fn();
          const setStatusBarTranslucent = vi.fn();
          const setStatusBarNetworkActivityIndicatorVisible = vi.fn();

          return {
            default: { StatusBar },
            StatusBar,
            setStatusBarStyle,
            setStatusBarHidden,
            setStatusBarBackgroundColor,
            setStatusBarTranslucent,
            setStatusBarNetworkActivityIndicatorVisible,
          };
        },
      },
    },
  };
}
