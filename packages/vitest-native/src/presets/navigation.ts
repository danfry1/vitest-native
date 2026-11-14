import type { NavigationPresetOptions, Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { hostComponent as hostClass } from "../mocks/host.js";
import { builtInPreset } from "./built-in.js";
import { projectContext } from "../context.mjs";

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
  defaultRouteParams: Record<string, unknown>,
) {
  const Screen = React.forwardRef(({ component: Component, children, ...rest }: any, ref: any) => {
    const route = {
      key: rest.name ?? "",
      name: rest.name ?? "",
      params: rest.initialParams ?? defaultRouteParams,
    };
    const nav = createMockNavigation();
    const content = Component
      ? React.createElement(Component, { route, navigation: nav })
      : typeof children === "function"
        ? children({ route, navigation: nav })
        : children;
    return React.createElement(
      hostClass("Screen"),
      { ...rest, ref },
      React.createElement(
        NavContext.Provider,
        { value: nav },
        React.createElement(RouteContext.Provider, { value: route }, content),
      ),
    );
  });
  (Screen as any).displayName = "Screen";
  return Screen;
}

export function navigation(presetOptions: NavigationPresetOptions = {}): Preset {
  // Route params returned by the default `useRoute()` (i.e. when a component is
  // rendered outside a mock <Screen>) and used as a <Screen>'s fallback params.
  // Configurable so components that read `useRoute().params.<x>` at mount can be
  // tested without a custom vi.mock. Must be JSON-serializable: it crosses the
  // worker boundary via the preset `config` below.
  const defaultRouteParams = presetOptions.defaultRouteParams ?? {};

  // Contexts are shared across all module factories in this preset so that
  // MockScreen can provide them and useNavigation()/useRoute() can read them.
  const NavigationContext = React.createContext(null as any);
  const NavigationRouteContext = React.createContext(null as any);
  const NavigationContainerRefContext = React.createContext(null as any);
  const NavigationHelpersContext = React.createContext(null as any);
  const CurrentRenderContext = React.createContext(undefined as any);
  const PreventRemoveContext = React.createContext(null as any);

  // The exports @react-navigation/native adds ON TOP of @react-navigation/core
  // (its src/index.tsx: linking, locale, themes, static navigation, link hooks).
  // These were absent, so anything rendering its own container against this
  // package — expo-router's forked NavigationContainer reads LinkingContext,
  // LocaleDirContext and UNSTABLE_UnhandledLinkingContext — failed with
  // "Cannot read properties of undefined (reading 'Provider')". Shapes follow
  // the real module: contexts are real React contexts with its default values,
  // themes carry its exact colors and platform font stacks.
  const LinkingContext = React.createContext<{ options?: any }>({ options: undefined });
  const LocaleDirContext = React.createContext<"ltr" | "rtl">("ltr");
  const UNSTABLE_UnhandledLinkingContext = React.createContext<{
    lastUnhandledLink: string | undefined;
    setLastUnhandledLink: (link: string | undefined) => void;
  }>({ lastUnhandledLink: undefined, setLastUnhandledLink: () => {} });
  const themeFonts = (() => {
    // Mirrors the real module's Platform.select — the mock is served to native
    // platforms only, so the ios / default branches are the reachable ones.
    const isIOS = projectContext()?.platform !== "android";
    return isIOS
      ? {
          regular: { fontFamily: "System", fontWeight: "400" },
          medium: { fontFamily: "System", fontWeight: "500" },
          bold: { fontFamily: "System", fontWeight: "600" },
          heavy: { fontFamily: "System", fontWeight: "700" },
        }
      : {
          regular: { fontFamily: "sans-serif", fontWeight: "normal" },
          medium: { fontFamily: "sans-serif-medium", fontWeight: "normal" },
          bold: { fontFamily: "sans-serif", fontWeight: "600" },
          heavy: { fontFamily: "sans-serif", fontWeight: "700" },
        };
  })();
  const DefaultTheme = {
    dark: false,
    colors: {
      primary: "rgb(0, 122, 255)",
      background: "rgb(242, 242, 242)",
      card: "rgb(255, 255, 255)",
      text: "rgb(28, 28, 30)",
      border: "rgb(216, 216, 216)",
      notification: "rgb(255, 59, 48)",
    },
    fonts: themeFonts,
  };
  const DarkTheme = {
    dark: true,
    colors: {
      primary: "rgb(10, 132, 255)",
      background: "rgb(1, 1, 1)",
      card: "rgb(18, 18, 18)",
      text: "rgb(229, 229, 231)",
      border: "rgb(39, 39, 41)",
      notification: "rgb(255, 69, 58)",
    },
    fonts: themeFonts,
  };

  // Real React Navigation seeds ThemeContext with DefaultTheme, so useTheme() outside a
  // ThemeProvider (and outside a render, as a plain call) yields the default theme.
  const ThemeContext = React.createContext<any>(DefaultTheme);

  const Screen = createMockScreen(NavigationContext, NavigationRouteContext, defaultRouteParams);

  return builtInPreset({
    name: "navigation",
    config: { defaultRouteParams },
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
          "LinkingContext",
          "LocaleDirContext",
          "UNSTABLE_UnhandledLinkingContext",
          "DefaultTheme",
          "DarkTheme",
          "createStaticNavigation",
          "ServerContainer",
          "useLinkBuilder",
          "useLinkProps",
          "useLocale",
          "useRoutePath",
          "createComponentForStaticNavigation",
          "createPathConfigForStaticNavigation",
          "createScreenFactory",
          "NavigationProvider",
          "createStandardNavigationFactories",
          // @react-navigation/routers (re-exported by core)
          "BaseRouter",
          "StackRouter",
          "TabRouter",
          "DrawerRouter",
        ],
        factory: () => {
          const NavigationContainer = React.forwardRef((props: any, ref: any) =>
            React.createElement(
              hostClass("NavigationContainer"),
              { ...props, ref },
              props.children,
            ),
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
            params: defaultRouteParams,
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

          // Navigation methods React Navigation 7 added beside the ones above (preloading,
          // replacing params, the pre-7 navigate) and the event emitter of a navigator's helpers.
          const preload = vi.fn();
          const replaceParams = vi.fn();
          const navigateDeprecated = vi.fn();
          const emit = vi.fn(() => ({ defaultPrevented: false }));

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
              removeListener: vi.fn(),
              resetRoot: vi.fn(),
              setParams,
              setOptions,
              replaceParams,
              preload,
              navigateDeprecated,
              emit,
              isFocused: vi.fn(() => true),
              getId: vi.fn(() => undefined),
              getParent,
            };
          }

          function useNavigationContainerRef() {
            return createNavigationContainerRef();
          }

          function ThemeProvider({ value, children }: any) {
            return React.createElement(
              ThemeContext.Provider,
              { value: value ?? DefaultTheme },
              children,
            );
          }

          function useTheme() {
            // Outside a render (a plain call, common in tests) useContext is not
            // available; the context default IS DefaultTheme, so answer that directly.
            try {
              return React.useContext(ThemeContext) ?? DefaultTheme;
            } catch {
              return DefaultTheme;
            }
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

          const CommonActions = {
            navigate: vi.fn(),
            reset: vi.fn(),
            goBack: vi.fn(),
            setParams: vi.fn(),
            // The action objects React Navigation's creators return.
            preload: vi.fn((name: string, params?: object) => ({
              type: "PRELOAD",
              payload: { name, params },
            })),
            replaceParams: vi.fn((params: object) => ({
              type: "REPLACE_PARAMS",
              payload: { params },
            })),
            navigateDeprecated: vi.fn((name: any, params?: object) => ({
              type: "NAVIGATE_DEPRECATED",
              payload: typeof name === "string" ? { name, params } : name,
            })),
          };
          const StackActions = {
            push: vi.fn(),
            pop: vi.fn(),
            popToTop: vi.fn(),
            replace: vi.fn(),
            popTo: vi.fn((name: string, params?: object, options?: { merge?: boolean }) => ({
              type: "POP_TO",
              payload: { name, params, merge: options?.merge },
            })),
          };
          const TabActions = {
            jumpTo: vi.fn(),
          };
          const DrawerActions = {
            openDrawer: vi.fn(),
            closeDrawer: vi.fn(),
            toggleDrawer: vi.fn(),
            jumpTo: vi.fn(),
          };

          // Provides a screen's route and navigation, as @react-navigation/core's does.
          function NavigationProvider({ route, navigation: helpers, children }: any) {
            return React.createElement(
              NavigationRouteContext.Provider,
              { value: route },
              React.createElement(NavigationContext.Provider, { value: helpers }, children),
            );
          }

          const BaseRouter = {
            getInitialState: vi.fn(() => getState()),
            getRehydratedState: vi.fn((state: any) => state),
            getStateForRouteNamesChange: vi.fn((state: any) => state),
            getStateForRouteFocus: vi.fn((state: any) => state),
            getStateForAction: vi.fn((state: any) => state),
            shouldActionChangeFocus: vi.fn(() => false),
          };
          /** A router factory: `StackRouter(options)` and the rest return a Router. */
          const routerFactory = (type: string, actionCreators: Record<string, unknown>) =>
            vi.fn((_options?: unknown) => ({
              ...BaseRouter,
              type,
              getInitialState: vi.fn(() => ({ ...getState(), type })),
              actionCreators,
            }));

          const BaseNavigationContainer = React.forwardRef((props: any, ref: any) =>
            React.createElement(
              hostClass("BaseNavigationContainer"),
              { ...props, ref },
              props.children,
            ),
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
            // Real shape: createNavigatorFactory(Navigator) returns a factory that
            // yields { Navigator, Screen, Group }. It used to return a bare vi.fn()
            // whose result was undefined, so any library building on the public
            // factory API — expo-router extracts its Screen/Group primitives via
            // createNavigatorFactory({})() — failed at import with
            // "Cannot read properties of undefined (reading 'Screen')".
            createNavigatorFactory: vi.fn((Navigator?: any) => () => ({
              Navigator:
                Navigator ??
                React.forwardRef((props: any, ref: any) =>
                  React.createElement(hostClass("Navigator"), { ...props, ref }, props.children),
                ),
              Screen,
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement(hostClass("Group"), { ...props, ref }, props.children),
              ),
            })),
            useNavigationBuilder: vi.fn(() => ({
              state: getState(),
              // A navigator's helpers: the navigation object, and its event emitter.
              navigation: {
                ...useNavigation(),
                emit,
                preload,
                replaceParams,
                navigateDeprecated,
              },
              descriptors: {},
              describe: vi.fn((route: any) => ({
                route,
                navigation: useNavigation(),
                options: {},
                render: () => null,
              })),
              render: vi.fn(() => null),
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
            CommonActions,
            StackActions,
            TabActions,
            DrawerActions,
            findFocusedRoute: vi.fn((state: any) => state?.routes?.[state?.index ?? 0]),
            getFocusedRouteNameFromRoute: vi.fn(
              (route: any) => route?.state?.routes?.[route?.state?.index ?? 0]?.name,
            ),
            getActionFromState: vi.fn(() => undefined),
            getPathFromState: vi.fn(() => "/"),
            getStateFromPath: vi.fn(() => undefined),
            useStateForPath: vi.fn(() => undefined),
            validatePathConfig: vi.fn(),
            BaseNavigationContainer,
            createComponentForStaticNavigation: vi.fn(() => () => null),
            createPathConfigForStaticNavigation: vi.fn(() => ({})),
            // A static screen's config is its own description: the factory returns it as is.
            createScreenFactory: () => (config: unknown) => config,
            NavigationProvider,
            createStandardNavigationFactories: vi.fn(() => ({
              createNavigator: () => ({
                Navigator: React.forwardRef((props: any, ref: any) =>
                  React.createElement(hostClass("Navigator"), { ...props, ref }, props.children),
                ),
                Screen,
                Group: React.forwardRef((props: any, ref: any) =>
                  React.createElement(hostClass("Group"), { ...props, ref }, props.children),
                ),
              }),
              createScreen: (config: unknown) => config,
            })),
            LinkingContext,
            LocaleDirContext,
            UNSTABLE_UnhandledLinkingContext,
            DefaultTheme,
            DarkTheme,
            // Static navigation renders the tree the same way NavigationContainer does.
            createStaticNavigation: vi.fn(() => NavigationContainer),
            ServerContainer: React.forwardRef((props: any, _ref: any) =>
              React.createElement(React.Fragment, null, props.children),
            ),
            useLinkBuilder: vi.fn(() => ({
              buildHref: (name: string) => `/${name}`,
              buildAction: (href: string) => ({ type: "NAVIGATE", payload: { name: href } }),
            })),
            useLinkProps: vi.fn(({ href, action }: any) => ({
              href,
              accessibilityRole: "link",
              onPress: () => action,
            })),
            useLocale: vi.fn(() => ({ direction: "ltr" as const })),
            useRoutePath: vi.fn(() => undefined),
            BaseRouter,
            StackRouter: routerFactory("stack", StackActions),
            TabRouter: routerFactory("tab", TabActions),
            DrawerRouter: routerFactory("drawer", DrawerActions),
            useScrollToTop: vi.fn(),
            useLinkTo: vi.fn(() => vi.fn()),
            Link: React.forwardRef((props: any, ref: any) =>
              React.createElement(hostClass("Link"), { ...props, ref }, props.children),
            ),
          };
        },
      },

      "@react-navigation/native-stack": {
        exports: ["createNativeStackNavigator", "createNativeStackScreen", "NativeStackView"],
        factory: () => {
          function createNativeStackNavigator() {
            return {
              Navigator: React.forwardRef((props: any, ref: any) =>
                React.createElement(
                  hostClass("NativeStackNavigator"),
                  { ...props, ref },
                  props.children,
                ),
              ),
              Screen,
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement(hostClass("Group"), { ...props, ref }, props.children),
              ),
            };
          }

          const NativeStackView = React.forwardRef((props: any, ref: any) =>
            React.createElement(hostClass("NativeStackView"), { ...props, ref }, props.children),
          );
          (NativeStackView as any).displayName = "NativeStackView";

          return {
            default: { createNativeStackNavigator },
            createNativeStackNavigator,
            // createScreenFactory's: a static screen's config, returned as is.
            createNativeStackScreen: (config: unknown) => config,
            NativeStackView,
          };
        },
      },

      "@react-navigation/bottom-tabs": {
        exports: ["createBottomTabNavigator"],
        factory: () => {
          function createBottomTabNavigator() {
            return {
              Navigator: React.forwardRef((props: any, ref: any) =>
                React.createElement(
                  hostClass("BottomTabNavigator"),
                  { ...props, ref },
                  props.children,
                ),
              ),
              Screen,
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement(hostClass("Group"), { ...props, ref }, props.children),
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
                React.createElement(
                  hostClass("DrawerNavigator"),
                  { ...props, ref },
                  props.children,
                ),
              ),
              Screen,
              Group: React.forwardRef((props: any, ref: any) =>
                React.createElement(hostClass("Group"), { ...props, ref }, props.children),
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
            React.createElement(hostClass("Header"), { ...props, ref }, props.children),
          );
          (Header as any).displayName = "Header";

          const HeaderBackground = React.forwardRef((props: any, ref: any) =>
            React.createElement(hostClass("HeaderBackground"), { ...props, ref }, props.children),
          );
          (HeaderBackground as any).displayName = "HeaderBackground";

          const HeaderBackButton = React.forwardRef((props: any, ref: any) =>
            React.createElement(hostClass("HeaderBackButton"), { ...props, ref }),
          );
          (HeaderBackButton as any).displayName = "HeaderBackButton";

          const HeaderTitle = React.forwardRef((props: any, ref: any) =>
            React.createElement(hostClass("HeaderTitle"), { ...props, ref }, props.children),
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
              (options: any, fallback: string) =>
                options?.headerTitle ?? options?.title ?? fallback,
            ),
          };
        },
      },
    },
  });
}
