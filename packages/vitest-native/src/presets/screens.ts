import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { hostComponent as hostClass, asHost } from "../mocks/host.js";
import { builtInPreset } from "./built-in.js";
import { activeReactNative } from "./active-react-native.js";

export function screens(): Preset {
  return builtInPreset({
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
              React.createElement(asHost(name), { ...props, ref }, props.children),
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
          //
          // It also renders the header. native-stack hands headerLeft, headerRight
          // and a custom title to ScreenStackItem as `headerConfig.children`
          // (@react-navigation/native-stack 7.x, useHeaderConfigProps.tsx), and the
          // real component renders `<ScreenStackHeaderConfig {...headerConfig} />`
          // after the screen's content, unconditionally, `hidden` included
          // (react-native-screens 4.25 src/components/ScreenStackItem.tsx). A stub
          // that rendered only `children` dropped every header element, so a
          // header button's testID could not be found. `headerConfig` itself is
          // not a host prop on the real Screen either.
          const ScreenStackItem = React.forwardRef(
            ({ headerConfig, children, ...props }: any, ref: any) =>
              React.createElement(
                hostClass("ScreenStackItem"),
                { ...props, ref },
                children,
                React.createElement(ScreenStackHeaderConfig, headerConfig),
              ),
          );
          ScreenStackItem.displayName = "ScreenStackItem";
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
          // An object of two components, as in the package (src/components/tabs/index.ts).
          const Tabs = {
            Host: createScreenComponent("TabsHost"),
            Screen: createScreenComponent("TabsScreen"),
          };

          // A real React context: native-stack reads it, and a component stub would
          // fail the moment anything calls useContext on it.
          const ScreenContext = React.createContext(Screen);
          // The package's hook reads the Animated values a native-stack Screen creates, each
          // `new Animated.Value(0)` (src/components/Screen.tsx), and moves them only on native
          // transition events, which a test has none of. Here each component gets its own
          // three values from the engine's Animated, kept across renders, so
          // `progress.interpolate(...)` and an `Animated.View` style work as in the app.
          const useTransitionProgress = vi.fn(function useTransitionProgress() {
            const values = React.useRef<Record<string, unknown> | null>(null);
            if (!values.current) {
              const { Animated } = activeReactNative();
              values.current = {
                progress: new Animated.Value(0),
                closing: new Animated.Value(0),
                goingForward: new Animated.Value(0),
              };
            }
            return values.current;
          });
          const executeNativeBackPress = vi.fn(() => true);
          const isSearchBarAvailableForCurrentPlatform = true;
          // The package's defaults (src/flags.ts), settable as there.
          const featureFlags = {
            experiment: {
              synchronousScreenUpdatesEnabled: false,
              synchronousHeaderConfigUpdatesEnabled: false,
              synchronousHeaderSubviewUpdatesEnabled: false,
              androidLegacyTopInsetBehavior: false,
              androidResetScreenShadowStateOnOrientationChangeEnabled: true,
              iosPreventReattachmentOfDismissedScreens: true,
              iosPreventReattachmentOfDismissedModals: true,
              ios26AllowInteractionsDuringTransition: true,
            },
            stable: { debugLogging: false },
          };
          // What native-stack reads to pick its code path for screens 4.x.
          const compatibilityFlags = {
            isNewBackTitleImplementation: true,
            usesHeaderFlexboxImplementation: true,
            usesNewAndroidHeaderHeightImplementation: true,
            usesStableTabsApi: true,
          };

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
  });
}
