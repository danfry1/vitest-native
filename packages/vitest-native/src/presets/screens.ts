import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

export function screens(): Preset {
  return {
    name: "screens",
    modules: {
      "react-native-screens": {
        exports: [
          // Checked against react-native-screens 4.26.2's published type surface
          // rather than against a list of names someone noticed missing: the
          // reported six were real, and there were sixteen.
          "enableScreens",
          "screensEnabled",
          "enableFreeze",
          "freezeEnabled",
          "featureFlags",
          "compatibilityFlags",
          "executeNativeBackPress",
          "isSearchBarAvailableForCurrentPlatform",
          "useTransitionProgress",
          "Screen",
          "InnerScreen",
          "ScreenContainer",
          "ScreenContentWrapper",
          "ScreenContext",
          "ScreenFooter",
          "ScreenStack",
          "ScreenStackItem",
          "ScreenStackHeaderConfig",
          "ScreenStackHeaderBackButtonImage",
          "ScreenStackHeaderCenterView",
          "ScreenStackHeaderLeftView",
          "ScreenStackHeaderRightView",
          "ScreenStackHeaderSearchBarView",
          "ScreenStackHeaderSubview",
          "SearchBar",
          "FullWindowOverlay",
          "Tabs",
          // Removed from the package at v4 but kept so a project still on v3 does
          // not lose them.
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
          const InnerScreen = createScreenComponent("InnerScreen");
          const ScreenContentWrapper = createScreenComponent("ScreenContentWrapper");
          const ScreenFooter = createScreenComponent("ScreenFooter");
          // native-stack renders through ScreenStackItem; without it the stack never
          // reaches onReady and the screen stays empty with nothing thrown.
          const ScreenStackItem = createScreenComponent("ScreenStackItem");
          const ScreenStackHeaderBackButtonImage = createScreenComponent(
            "ScreenStackHeaderBackButtonImage",
          );
          const ScreenStackHeaderCenterView = createScreenComponent("ScreenStackHeaderCenterView");
          const ScreenStackHeaderLeftView = createScreenComponent("ScreenStackHeaderLeftView");
          const ScreenStackHeaderRightView = createScreenComponent("ScreenStackHeaderRightView");
          const ScreenStackHeaderSearchBarView = createScreenComponent(
            "ScreenStackHeaderSearchBarView",
          );
          const ScreenStackHeaderSubview = createScreenComponent("ScreenStackHeaderSubview");
          const Tabs = createScreenComponent("Tabs");

          // A real React context: native-stack reads it, and a component stub would
          // fail the moment anything calls useContext on it.
          const ScreenContext = React.createContext(Screen);
          const useTransitionProgress = vi.fn(() => ({ progress: 1, closing: 0, goingForward: 0 }));
          const executeNativeBackPress = vi.fn(() => true);
          const isSearchBarAvailableForCurrentPlatform = true;
          const featureFlags = { experiment: {}, flags: {} };
          const compatibilityFlags = {};

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
            InnerScreen,
            ScreenContentWrapper,
            ScreenContext,
            ScreenFooter,
            ScreenStackItem,
            ScreenStackHeaderBackButtonImage,
            ScreenStackHeaderCenterView,
            ScreenStackHeaderLeftView,
            ScreenStackHeaderRightView,
            ScreenStackHeaderSearchBarView,
            ScreenStackHeaderSubview,
            Tabs,
            useTransitionProgress,
            executeNativeBackPress,
            isSearchBarAvailableForCurrentPlatform,
            featureFlags,
            compatibilityFlags,
          };
        },
      },
    },
  };
}
