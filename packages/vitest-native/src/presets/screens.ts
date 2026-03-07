import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

export function screens(): Preset {
  return {
    name: "screens",
    modules: {
      "react-native-screens": {
        exports: [
          "enableScreens",
          "screensEnabled",
          "enableFreeze",
          "freezeEnabled",
          "Screen",
          "ScreenContainer",
          "ScreenStack",
          "ScreenStackHeaderConfig",
          "SearchBar",
          "FullWindowOverlay",
          "NativeScreen",
          "NativeScreenContainer",
        ],
        factory: () => {
          let screensEnabledFlag = true;
          let freezeEnabledFlag = false;

          const enableScreens = vi.fn((shouldEnableScreens?: boolean) => {
            screensEnabledFlag = shouldEnableScreens !== false;
          });

          const screensEnabled = vi.fn(() => screensEnabledFlag);

          const enableFreeze = vi.fn((shouldEnableFreeze?: boolean) => {
            freezeEnabledFlag = shouldEnableFreeze !== false;
          });

          const freezeEnabled = vi.fn(() => freezeEnabledFlag);

          function createScreenComponent(name: string) {
            const Component = React.forwardRef((props: any, ref: any) =>
              React.createElement(name, { ...props, ref }, props.children),
            );
            Component.displayName = name;
            return Component;
          }

          const Screen = createScreenComponent("Screen");
          const ScreenContainer = createScreenComponent("ScreenContainer");
          const ScreenStack = createScreenComponent("ScreenStack");
          const ScreenStackHeaderConfig = createScreenComponent("ScreenStackHeaderConfig");
          const SearchBar = createScreenComponent("SearchBar");
          const FullWindowOverlay = createScreenComponent("FullWindowOverlay");
          const NativeScreen = createScreenComponent("NativeScreen");
          const NativeScreenContainer = createScreenComponent("NativeScreenContainer");

          return {
            default: { Screen, ScreenContainer, enableScreens, screensEnabled },
            enableScreens,
            screensEnabled,
            enableFreeze,
            freezeEnabled,
            Screen,
            ScreenContainer,
            ScreenStack,
            ScreenStackHeaderConfig,
            SearchBar,
            FullWindowOverlay,
            NativeScreen,
            NativeScreenContainer,
          };
        },
      },
    },
  };
}
