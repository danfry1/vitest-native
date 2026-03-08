import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

export function navigation(): Preset {
  return {
    name: "navigation",
    modules: {
      "@react-navigation/native": {
        exports: [
          "NavigationContainer",
          "useNavigation",
          "useRoute",
          "useFocusEffect",
          "useIsFocused",
          "useNavigationState",
          "createNavigationContainerRef",
          "NavigationContext",
          "NavigationRouteContext",
          "CommonActions",
          "StackActions",
          "TabActions",
          "DrawerActions",
          "useLinkTo",
          "Link",
        ],
        factory: () => {
          const NavigationContainer = React.forwardRef((props: any, ref: any) =>
            React.createElement("NavigationContainer", { ...props, ref }, props.children),
          );
          NavigationContainer.displayName = "NavigationContainer";

          const navigate = vi.fn();
          const goBack = vi.fn();
          const reset = vi.fn();
          const setParams = vi.fn();
          const setOptions = vi.fn();
          const dispatch = vi.fn();
          const canGoBack = vi.fn(() => false);
          const getParent = vi.fn(() => undefined);
          const getState = vi.fn(() => ({
            index: 0,
            key: "root",
            routeNames: [],
            routes: [],
            type: "stack",
            stale: false,
          }));

          function useNavigation() {
            return {
              navigate,
              goBack,
              reset,
              setParams,
              setOptions,
              dispatch,
              canGoBack,
              getParent,
              getState,
              isFocused: vi.fn(() => true),
              addListener: vi.fn(() => vi.fn()),
              removeListener: vi.fn(),
              getId: vi.fn(() => undefined),
            };
          }

          function useRoute() {
            return {
              key: "test-route-key",
              name: "TestScreen",
              params: {},
            };
          }

          function useFocusEffect(callback: () => any) {
            React.useEffect(callback, []);
          }

          function useIsFocused() {
            return true;
          }

          function useNavigationState(selector: (state: any) => any) {
            return selector(getState());
          }

          function createNavigationContainerRef() {
            return {
              current: null,
              isReady: vi.fn(() => true),
              navigate,
              goBack,
              reset,
              dispatch,
              canGoBack,
              getState,
              getRootState: getState,
              getCurrentRoute: vi.fn(() => ({ key: "test", name: "TestScreen" })),
              getCurrentOptions: vi.fn(() => ({})),
              addListener: vi.fn(() => vi.fn()),
            };
          }

          const NavigationContext = React.createContext(null as any);
          const NavigationRouteContext = React.createContext(null as any);

          return {
            default: { NavigationContainer },
            NavigationContainer,
            useNavigation,
            useRoute,
            useFocusEffect,
            useIsFocused,
            useNavigationState,
            createNavigationContainerRef,
            NavigationContext,
            NavigationRouteContext,
            CommonActions: {
              navigate: vi.fn(),
              reset: vi.fn(),
              goBack: vi.fn(),
              setParams: vi.fn(),
            },
            StackActions: {
              push: vi.fn(),
              pop: vi.fn(),
              popToTop: vi.fn(),
              replace: vi.fn(),
            },
            TabActions: {
              jumpTo: vi.fn(),
            },
            DrawerActions: {
              openDrawer: vi.fn(),
              closeDrawer: vi.fn(),
              toggleDrawer: vi.fn(),
              jumpTo: vi.fn(),
            },
            useLinkTo: vi.fn(() => vi.fn()),
            Link: React.forwardRef((props: any, ref: any) =>
              React.createElement("Link", { ...props, ref }, props.children),
            ),
          };
        },
      },

      "@react-navigation/native-stack": {
        exports: ["createNativeStackNavigator"],
        factory: () => {
          function createNativeStackNavigator() {
            return {
              Navigator: React.forwardRef((props: any, ref: any) =>
                React.createElement("NativeStackNavigator", { ...props, ref }, props.children),
              ),
              Screen: React.forwardRef((props: any, ref: any) =>
                React.createElement("Screen", { ...props, ref }, props.children),
              ),
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement("Group", { ...props, ref }, props.children),
              ),
            };
          }

          return {
            default: { createNativeStackNavigator },
            createNativeStackNavigator,
          };
        },
      },

      "@react-navigation/bottom-tabs": {
        exports: ["createBottomTabNavigator"],
        factory: () => {
          function createBottomTabNavigator() {
            return {
              Navigator: React.forwardRef((props: any, ref: any) =>
                React.createElement("BottomTabNavigator", { ...props, ref }, props.children),
              ),
              Screen: React.forwardRef((props: any, ref: any) =>
                React.createElement("Screen", { ...props, ref }, props.children),
              ),
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement("Group", { ...props, ref }, props.children),
              ),
            };
          }

          return {
            default: { createBottomTabNavigator },
            createBottomTabNavigator,
          };
        },
      },

      "@react-navigation/elements": {
        exports: [
          "Header",
          "HeaderBackground",
          "HeaderBackButton",
          "HeaderTitle",
          "HeaderBackContext",
          "HeaderShownContext",
          "HeaderHeightContext",
          "useHeaderHeight",
          "getDefaultHeaderHeight",
          "getHeaderTitle",
        ],
        factory: () => {
          const Header = React.forwardRef((props: any, ref: any) =>
            React.createElement("Header", { ...props, ref }, props.children),
          );
          (Header as any).displayName = "Header";

          const HeaderBackground = React.forwardRef((props: any, ref: any) =>
            React.createElement("HeaderBackground", { ...props, ref }, props.children),
          );
          (HeaderBackground as any).displayName = "HeaderBackground";

          const HeaderBackButton = React.forwardRef((props: any, ref: any) =>
            React.createElement("HeaderBackButton", { ...props, ref }),
          );
          (HeaderBackButton as any).displayName = "HeaderBackButton";

          const HeaderTitle = React.forwardRef((props: any, ref: any) =>
            React.createElement("HeaderTitle", { ...props, ref }, props.children),
          );
          (HeaderTitle as any).displayName = "HeaderTitle";

          return {
            default: { Header, HeaderBackground, HeaderBackButton, HeaderTitle },
            Header,
            HeaderBackground,
            HeaderBackButton,
            HeaderTitle,
            HeaderBackContext: React.createContext(undefined as any),
            HeaderShownContext: React.createContext(true),
            HeaderHeightContext: React.createContext(64),
            useHeaderHeight: () => 64,
            getDefaultHeaderHeight: vi.fn(() => 64),
            getHeaderTitle: vi.fn(
              (options: any, fallback: string) => options?.headerTitle ?? options?.title ?? fallback,
            ),
          };
        },
      },
    },
  };
}
