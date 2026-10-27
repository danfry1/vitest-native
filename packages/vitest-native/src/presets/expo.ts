import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { builtInPreset } from "./built-in.js";

export function expo(): Preset {
  return builtInPreset({
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
        // The module's API since SDK 52 (expo-splash-screen 0.29): `hide()` and
        // `setOptions()` are synchronous, and `hideAsync()` stays for backwards
        // compatibility (build/SplashScreen.native.js). Under the native engine the real
        // package runs instead; this serves the mock engine and `presets: { expo: true }`.
        exports: ["preventAutoHideAsync", "hideAsync", "hide", "setOptions"],
        factory: () => {
          const preventAutoHideAsync = vi.fn(async () => true);
          const hideAsync = vi.fn(async () => true);
          const hide = vi.fn(() => {});
          const setOptions = vi.fn((_options: { duration?: number; fade?: boolean }) => {});

          const exports = {
            preventAutoHideAsync,
            hideAsync,
            hide,
            setOptions,
          };

          return {
            ...exports,
            default: exports,
          };
        },
      },

      "expo-linking": {
        exports: [
          "createURL",
          "parse",
          "useURL",
          "resolveScheme",
          "addEventListener",
          "getInitialURL",
          "getLinkingURL",
          "openURL",
          "unwrapDevLaunchURL",
        ],
        factory: () => {
          const createURL = vi.fn((path: string) => `exp://localhost:19000/${path}`);
          const parse = vi.fn((url: string) => ({
            scheme: "exp",
            hostname: "localhost",
            path: url,
            queryParams: {},
          }));
          const useURL = vi.fn(() => null);
          // expo-router's linking layer calls these while rendering an ExpoRoot;
          // without them any router render throws. Mirrors the module mock that
          // expo-router/testing-library registers for Jest.
          const resolveScheme = vi.fn(() => "exp");
          const addEventListener = vi.fn(() => ({ remove: () => {} }));
          const getInitialURL = vi.fn(async () => null);
          // SDK 58's router also reads the launch URL synchronously, opens redirects
          // with openURL, and unwraps dev-client launch URLs before matching a route.
          const getLinkingURL = vi.fn(() => null);
          const openURL = vi.fn(async (_url: string) => true as const);
          // A pure function in expo-linking (src/devLaunchURL.ts), ported as is: it
          // returns the target of a `__expo_url` (or legacy dev-client `url`) launch
          // command, or the URL without its reserved `__expo_*` parameters.
          const unwrapDevLaunchURL = vi.fn((url: string) => {
            let parsed: URL;
            try {
              parsed = new URL(url);
            } catch {
              return url;
            }
            const isLegacyHost = parsed.hostname === "expo-development-client";
            const target =
              parsed.searchParams.get("__expo_url") ??
              (isLegacyHost ? parsed.searchParams.get("url") : null);
            if (target != null) return target;
            if (isLegacyHost) return "";
            const reserved = [...parsed.searchParams.keys()].filter((key) =>
              key.startsWith("__expo_"),
            );
            if (!reserved.length) return url;
            for (const key of reserved) parsed.searchParams.delete(key);
            return parsed.toString();
          });

          const exports = {
            createURL,
            parse,
            useURL,
            resolveScheme,
            addEventListener,
            getInitialURL,
            getLinkingURL,
            openURL,
            unwrapDevLaunchURL,
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
  });
}
