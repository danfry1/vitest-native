import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";

/** Builds a minimal navigation prop matching useNavigation()'s shape. */
function createMockNavigation() {
  return {
    navigate: vi.fn(),
    goBack: vi.fn(),
    reset: vi.fn(),
    setParams: vi.fn(),
    setOptions: vi.fn(),
    dispatch: vi.fn(),
    canGoBack: vi.fn(() => false),
    getParent: vi.fn(() => undefined),
    getState: vi.fn(() => ({
      index: 0,
      key: "root",
      routeNames: [],
      routes: [],
      type: "stack",
      stale: false,
    })),
    isFocused: vi.fn(() => true),
    addListener: vi.fn(() => vi.fn()),
    removeListener: vi.fn(),
    getId: vi.fn(() => undefined),
  };
}

/**
 * Creates a Screen component mock that handles all three React Navigation patterns:
 * 1. <Screen component={Comp} /> — renders Comp with route & navigation props
 * 2. <Screen>{(props) => <Comp />}</Screen> — calls render function
 * 3. <Screen><Something /></Screen> — passes children through
 *
 * Accepts NavigationContext and NavigationRouteContext so that hooks like
 * useNavigation() and useRoute() inside the screen component return values
 * consistent with the route/navigation props passed to the component.
 */
function createMockScreen(
  NavContext: React.Context<any>,
  RouteContext: React.Context<any>,
) {
  const Screen = React.forwardRef(
    ({ component: Component, children, ...rest }: any, ref: any) => {
      const route = {
        key: rest.name ?? "",
        name: rest.name ?? "",
        params: rest.initialParams,
      };
      const nav = createMockNavigation();
      const content = Component
        ? React.createElement(Component, { route, navigation: nav })
        : typeof children === "function"
          ? children({ route, navigation: nav })
          : children;
      return React.createElement(
        "Screen",
        { ...rest, ref },
        React.createElement(
          NavContext.Provider,
          { value: nav },
          React.createElement(RouteContext.Provider, { value: route }, content),
        ),
      );
    },
  );
  (Screen as any).displayName = "Screen";
  return Screen;
}

export function navigation(): Preset {
  // Contexts are shared across all module factories in this preset so that
  // MockScreen can provide them and useNavigation()/useRoute() can read them.
  const NavigationContext = React.createContext(null as any);
  const NavigationRouteContext = React.createContext(null as any);
  const NavigationContainerRefContext = React.createContext(null as any);
  const NavigationHelpersContext = React.createContext(null as any);
  const CurrentRenderContext = React.createContext(undefined as any);
  const ThemeContext = React.createContext({ dark: false, colors: {} } as any);
  const PreventRemoveContext = React.createContext(null as any);

  const Screen = createMockScreen(NavigationContext, NavigationRouteContext);

  return {
    name: "navigation",
    modules: {
      "@react-navigation/native": {
        exports: [
          // @react-navigation/native
          "NavigationContainer",
          "useLinkTo",
          "Link",
          // @react-navigation/core (re-exported by native)
          "useNavigation",
          "useRoute",
          "useFocusEffect",
          "useIsFocused",
          "useNavigationState",
          "useScrollToTop",
          "useNavigationContainerRef",
          "createNavigationContainerRef",
          "createNavigatorFactory",
          "useNavigationBuilder",
          "NavigationContext",
          "NavigationRouteContext",
          "NavigationContainerRefContext",
          "NavigationHelpersContext",
          "CurrentRenderContext",
          "ThemeContext",
          "ThemeProvider",
          "useTheme",
          "NavigationIndependentTree",
          "useNavigationIndependentTree",
          "PreventRemoveContext",
          "PreventRemoveProvider",
          "usePreventRemove",
          "usePreventRemoveContext",
          "CommonActions",
          "StackActions",
          "TabActions",
          "DrawerActions",
          "findFocusedRoute",
          "getFocusedRouteNameFromRoute",
          "getActionFromState",
          "getPathFromState",
          "getStateFromPath",
          "useStateForPath",
          "validatePathConfig",
          "BaseNavigationContainer",
          "createComponentForStaticNavigation",
          "createPathConfigForStaticNavigation",
          // @react-navigation/routers (re-exported by core)
          "BaseRouter",
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

          const defaultNavigation = {
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

          const defaultRoute = {
            key: "test-route-key",
            name: "TestScreen",
            params: {},
          };

          function useNavigation() {
            // Inside a React component rendered within MockScreen, the context
            // provides the screen-specific navigation object. Falls back to
            // the default when called outside a component (e.g. in tests that
            // call the mock directly) or when no Screen context is present.
            try {
              const ctx = React.useContext(NavigationContext);
              if (ctx) return ctx;
            } catch {
              // useContext throws outside a render — fall through to default.
            }
            return defaultNavigation;
          }

          function useRoute() {
            try {
              const ctx = React.useContext(NavigationRouteContext);
              if (ctx) return ctx;
            } catch {
              // useContext throws outside a render — fall through to default.
            }
            return defaultRoute;
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

          function useNavigationContainerRef() {
            return createNavigationContainerRef();
          }

          const defaultTheme = {
            dark: false,
            colors: {
              primary: "rgb(0, 122, 255)",
              background: "rgb(242, 242, 242)",
              card: "rgb(255, 255, 255)",
              text: "rgb(28, 28, 30)",
              border: "rgb(216, 216, 216)",
              notification: "rgb(255, 59, 48)",
            },
          };

          function ThemeProvider({ value, children }: any) {
            return React.createElement(ThemeContext.Provider, { value: value ?? defaultTheme }, children);
          }

          function useTheme() {
            return defaultTheme;
          }

          function NavigationIndependentTree({ children }: any) {
            return children;
          }

          function useNavigationIndependentTree() {
            return true;
          }

          function PreventRemoveProvider({ children }: any) {
            return children;
          }

          const BaseNavigationContainer = React.forwardRef((props: any, ref: any) =>
            React.createElement("BaseNavigationContainer", { ...props, ref }, props.children),
          );
          (BaseNavigationContainer as any).displayName = "BaseNavigationContainer";

          return {
            default: { NavigationContainer },
            NavigationContainer,
            useNavigation,
            useRoute,
            useFocusEffect,
            useIsFocused,
            useNavigationState,
            useNavigationContainerRef,
            createNavigationContainerRef,
            createNavigatorFactory: vi.fn(() => vi.fn()),
            useNavigationBuilder: vi.fn(() => ({
              state: getState(),
              navigation: useNavigation(),
              descriptors: {},
              NavigationContent: ({ children }: any) => children,
            })),
            NavigationContext,
            NavigationRouteContext,
            NavigationContainerRefContext,
            NavigationHelpersContext,
            CurrentRenderContext,
            ThemeContext,
            ThemeProvider,
            useTheme,
            NavigationIndependentTree,
            useNavigationIndependentTree,
            PreventRemoveContext,
            PreventRemoveProvider,
            usePreventRemove: vi.fn(),
            usePreventRemoveContext: vi.fn(() => null),
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
            findFocusedRoute: vi.fn((state: any) => state?.routes?.[state?.index ?? 0]),
            getFocusedRouteNameFromRoute: vi.fn((route: any) => route?.state?.routes?.[route?.state?.index ?? 0]?.name),
            getActionFromState: vi.fn(() => undefined),
            getPathFromState: vi.fn(() => "/"),
            getStateFromPath: vi.fn(() => undefined),
            useStateForPath: vi.fn(() => undefined),
            validatePathConfig: vi.fn(),
            BaseNavigationContainer,
            createComponentForStaticNavigation: vi.fn(() => () => null),
            createPathConfigForStaticNavigation: vi.fn(() => ({})),
            BaseRouter: {
              getInitialState: vi.fn(() => getState()),
              getRehydratedState: vi.fn((state: any) => state),
              getStateForRouteNamesChange: vi.fn((state: any) => state),
              getStateForRouteFocus: vi.fn((state: any) => state),
              getStateForAction: vi.fn((state: any) => state),
              shouldActionChangeFocus: vi.fn(() => false),
            },
            useScrollToTop: vi.fn(),
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
              Screen,
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
              Screen,
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

      "@react-navigation/drawer": {
        exports: ["createDrawerNavigator"],
        factory: () => {
          function createDrawerNavigator() {
            return {
              Navigator: React.forwardRef((props: any, ref: any) =>
                React.createElement("DrawerNavigator", { ...props, ref }, props.children),
              ),
              Screen,
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement("Group", { ...props, ref }, props.children),
              ),
            };
          }

          return {
            default: { createDrawerNavigator },
            createDrawerNavigator,
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
