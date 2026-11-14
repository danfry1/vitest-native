/**
 * Behavioral tests for all built-in presets.
 * Verifies that each preset's factory produces mocks with correct shapes,
 * callable methods, and expected return values — not just that they exist.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import {
  reanimated,
  gestureHandler,
  safeAreaContext,
  navigation,
  asyncStorage,
  screens,
  expo,
  deviceInfo,
  mmkv,
  svg,
  webview,
  flashList,
  bottomSheet,
  keyboardController,
} from "../src/presets/index.js";
import * as Presets from "../src/presets/index.js";
import { AUTO_DETECT_PRESETS, PRESET_MODULES } from "../src/preset-map.js";
import { renderHook } from "@testing-library/react-native";
import { setPlatform } from "../src/helpers.js";

// --- Navigation ---

describe("preset: navigation", () => {
  const preset = navigation();
  const mock = preset.modules["@react-navigation/native"].factory({ React });

  // createNavigatorFactory(Navigator) returns a factory yielding { Navigator, Screen,
  // Group } — the real shape. It returned a bare vi.fn() whose result was undefined,
  // so any library building on the public factory API (expo-router extracts its
  // Screen/Group primitives via createNavigatorFactory({})()) failed at import.
  it("createNavigatorFactory returns the real { Navigator, Screen, Group } shape", () => {
    const factory = mock.createNavigatorFactory({});
    const nav = factory();
    expect(nav.Screen).toBeDefined();
    expect(nav.Group).toBeDefined();
    expect(nav.Navigator).toBeDefined();
    // The supplied Navigator is the one returned.
    const Custom = () => null;
    expect(mock.createNavigatorFactory(Custom)().Navigator).toBe(Custom);
  });

  // The exports @react-navigation/native adds on top of @react-navigation/core.
  // Absent, anything rendering its own container against the package (expo-router's
  // forked NavigationContainer reads the linking/locale contexts) failed with
  // "Cannot read properties of undefined (reading 'Provider')".
  it("exports the linking, locale, theme and static-navigation surface", () => {
    for (const name of [
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
    ]) {
      expect(mock[name], name).toBeDefined();
      // Every runtime export must also be in the preset's declared export list —
      // that list is what feeds the ESM loader's named exports.
      expect(preset.modules["@react-navigation/native"].exports, name).toContain(name);
    }
    expect(mock.LinkingContext.Provider).toBeDefined();
    expect(mock.DefaultTheme.colors.primary).toBe("rgb(0, 122, 255)");
    expect(mock.DarkTheme.dark).toBe(true);
    expect(mock.DefaultTheme.fonts.regular.fontFamily).toBeDefined();
  });

  it("useNavigation returns an object with navigate, goBack, reset", async () => {
    const { result } = await renderHook(() => mock.useNavigation());
    const nav = result.current;
    expect(typeof nav.navigate).toBe("function");
    expect(typeof nav.goBack).toBe("function");
    expect(typeof nav.reset).toBe("function");
    expect(typeof nav.setParams).toBe("function");
    expect(typeof nav.dispatch).toBe("function");
    expect(typeof nav.removeListener).toBe("function");
    expect(typeof nav.getId).toBe("function");
  });

  it("navigate is callable as a mock", async () => {
    const { result } = await renderHook(() => mock.useNavigation());
    const nav = result.current;
    nav.navigate("Home", { id: 1 });
    expect(nav.navigate).toHaveBeenCalledWith("Home", { id: 1 });
  });

  it("useRoute returns route shape", async () => {
    const { result } = await renderHook(() => mock.useRoute());
    const route = result.current;
    expect(route).toHaveProperty("key");
    expect(route).toHaveProperty("name");
    expect(route).toHaveProperty("params");
  });

  it("useIsFocused returns true", () => {
    expect(mock.useIsFocused()).toBe(true);
  });

  it("NavigationContainer is a renderable component", () => {
    expect(mock.NavigationContainer).toBeDefined();
    expect(mock.NavigationContainer.displayName).toBe("NavigationContainer");
  });

  it("CommonActions has navigate, reset, goBack", () => {
    expect(typeof mock.CommonActions.navigate).toBe("function");
    expect(typeof mock.CommonActions.reset).toBe("function");
    expect(typeof mock.CommonActions.goBack).toBe("function");
  });

  it("StackActions has push, pop, popToTop, replace", () => {
    expect(typeof mock.StackActions.push).toBe("function");
    expect(typeof mock.StackActions.pop).toBe("function");
    expect(typeof mock.StackActions.popToTop).toBe("function");
    expect(typeof mock.StackActions.replace).toBe("function");
  });

  it("createNavigationContainerRef returns ref-like object", () => {
    const ref = mock.createNavigationContainerRef();
    expect(typeof ref.navigate).toBe("function");
    expect(typeof ref.goBack).toBe("function");
    expect(typeof ref.isReady).toBe("function");
    expect(typeof ref.getCurrentRoute).toBe("function");
  });

  it("useNavigationContainerRef returns a ref with navigation methods", () => {
    const ref = mock.useNavigationContainerRef();
    expect(typeof ref.navigate).toBe("function");
    expect(typeof ref.goBack).toBe("function");
    expect(typeof ref.isReady).toBe("function");
    expect(typeof ref.getCurrentRoute).toBe("function");
  });

  // React Navigation 7's actions, container-ref methods and exports the preset lacked (#712).
  describe("React Navigation 7 additions", () => {
    it("the new action creators return React Navigation's action objects", () => {
      expect(mock.CommonActions.preload("Profile", { id: 1 })).toEqual({
        type: "PRELOAD",
        payload: { name: "Profile", params: { id: 1 } },
      });
      expect(mock.CommonActions.replaceParams({ id: 2 })).toEqual({
        type: "REPLACE_PARAMS",
        payload: { params: { id: 2 } },
      });
      expect(mock.CommonActions.navigateDeprecated("Home", { tab: 1 })).toEqual({
        type: "NAVIGATE_DEPRECATED",
        payload: { name: "Home", params: { tab: 1 } },
      });
      expect(mock.CommonActions.navigateDeprecated({ name: "Home" })).toEqual({
        type: "NAVIGATE_DEPRECATED",
        payload: { name: "Home" },
      });
      expect(mock.StackActions.popTo("Home", { id: 3 }, { merge: true })).toEqual({
        type: "POP_TO",
        payload: { name: "Home", params: { id: 3 }, merge: true },
      });
    });

    it("a container ref has React Navigation 7's methods, sharing the navigation spies", () => {
      const ref = mock.createNavigationContainerRef();
      for (const name of [
        "resetRoot",
        "removeListener",
        "preload",
        "replaceParams",
        "navigateDeprecated",
      ]) {
        expect(typeof ref[name], name).toBe("function");
      }
      ref.setParams({ id: 4 });
      expect(mock.useNavigation().setParams).toHaveBeenCalledWith({ id: 4 });
      ref.setOptions({ title: "T" });
      expect(mock.useNavigation().setOptions).toHaveBeenCalledWith({ title: "T" });
      expect(ref.isFocused()).toBe(true);
      expect(ref.getId()).toBeUndefined();
      expect(ref.getParent()).toBeUndefined();
      expect(ref.emit({ type: "focus" })).toEqual({ defaultPrevented: false });
      expect(typeof mock.useNavigationContainerRef().resetRoot).toBe("function");
    });

    it("useNavigationBuilder gives a navigator's helpers, describe and render", async () => {
      const { result } = await renderHook(() => mock.useNavigationBuilder());
      const { navigation: helpers, describe: describeRoute, render } = result.current;
      for (const name of ["preload", "replaceParams", "navigateDeprecated", "navigate"]) {
        expect(typeof helpers[name], name).toBe("function");
      }
      const route = { key: "a", name: "A" };
      expect(describeRoute(route).route).toBe(route);
      expect(describeRoute(route).render()).toBeNull();
      expect(render()).toBeNull();
    });

    it("useNavigationBuilder's navigation is a navigator's helpers, with emit, the same on every render", async () => {
      const { result, rerender } = await renderHook(() => ({
        builder: mock.useNavigationBuilder(),
        navigation: mock.useNavigation(),
      }));
      // A screen's navigation has no emit; React Navigation's core strips it.
      expect(result.current.navigation).not.toHaveProperty("emit");
      const helpers = result.current.builder.navigation;
      expect(typeof helpers.emit).toBe("function");
      // The same mocks as the screen's, so a call through either is seen on both.
      expect(helpers.navigate).toBe(result.current.navigation.navigate);
      await rerender({});
      expect(result.current.builder.navigation).toBe(helpers);
    });

    it("useNavigationBuilder's emit returns React Navigation's event", async () => {
      const { result } = await renderHook(() => mock.useNavigationBuilder());
      const { emit } = result.current.navigation;
      expect(emit({ type: "focus", target: "a" })).toEqual({ type: "focus", target: "a" });
      const event = emit({ type: "beforeRemove", data: { x: 1 }, canPreventDefault: true });
      expect(event).toMatchObject({
        type: "beforeRemove",
        data: { x: 1 },
        defaultPrevented: false,
      });
      event.preventDefault();
      expect(event.defaultPrevented).toBe(true);
    });

    it("useLinkProps gives the role React Navigation 7 gives", async () => {
      const { result } = await renderHook(() => mock.useLinkProps({ href: "/a" }));
      expect(result.current).toMatchObject({ href: "/a", role: "link" });
      expect(result.current).not.toHaveProperty("accessibilityRole");
    });

    it("navigateDeprecated with an object needs a name, as React Navigation's does", () => {
      expect(() => mock.CommonActions.navigateDeprecated({ params: {} })).toThrow(
        "You need to specify a name when calling navigateDeprecated",
      );
    });

    it("popTo's deprecated boolean merge warns and merges", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(mock.StackActions.popTo("Home", undefined, true)).toEqual({
          type: "POP_TO",
          payload: { name: "Home", params: undefined, merge: true },
        });
        expect(warn).toHaveBeenCalledWith(
          "Passing a boolean as the third argument to 'popTo' is deprecated. Pass '{ merge: true }' instead.",
        );
      } finally {
        warn.mockRestore();
      }
    });

    it("NavigationProvider gives its children the route and navigation", async () => {
      const route = { key: "r", name: "Details", params: { id: 7 } };
      const nav = { navigate: () => {} };
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(mock.NavigationProvider, { route, navigation: nav }, children);
      const { result } = await renderHook(
        () => ({ route: mock.useRoute(), navigation: mock.useNavigation() }),
        { wrapper },
      );
      expect(result.current.route).toBe(route);
      expect(result.current.navigation).toBe(nav);
    });

    it("the router factories return a router of their type with its action creators", () => {
      expect(mock.StackRouter({}).type).toBe("stack");
      expect(mock.StackRouter({}).actionCreators).toBe(mock.StackActions);
      expect(mock.TabRouter({}).type).toBe("tab");
      expect(mock.TabRouter({}).actionCreators).toBe(mock.TabActions);
      expect(mock.DrawerRouter({}).type).toBe("drawer");
      expect(mock.DrawerRouter({}).actionCreators).toBe(mock.DrawerActions);
      expect(mock.StackRouter({}).getInitialState().type).toBe("stack");
    });

    it("static screen factories return the screen config as is", () => {
      const config = { screen: () => null };
      expect(mock.createScreenFactory()(config)).toBe(config);
      const factories = mock.createStandardNavigationFactories({}, () => ({}));
      expect(factories.createScreen(config)).toBe(config);
      const navigator = factories.createNavigator();
      expect(navigator.Screen).toBeDefined();
      expect(navigator.Navigator).toBeDefined();
      expect(navigator.Group).toBeDefined();
    });
  });

  it("useTheme returns a theme with colors", () => {
    const theme = mock.useTheme();
    expect(theme.dark).toBe(false);
    expect(theme.colors).toBeDefined();
    expect(theme.colors.primary).toBeDefined();
    expect(theme.colors.background).toBeDefined();
  });

  it("ThemeProvider is a component", () => {
    expect(typeof mock.ThemeProvider).toBe("function");
  });

  it("NavigationIndependentTree passes through children", () => {
    const children = "test";
    expect(mock.NavigationIndependentTree({ children })).toBe(children);
  });

  it("each context provider is a React context with Provider", () => {
    expect(mock.NavigationContainerRefContext.Provider).toBeDefined();
    expect(mock.NavigationHelpersContext.Provider).toBeDefined();
    expect(mock.CurrentRenderContext.Provider).toBeDefined();
    expect(mock.ThemeContext.Provider).toBeDefined();
    expect(mock.PreventRemoveContext.Provider).toBeDefined();
  });

  it("BaseRouter has all required methods", () => {
    expect(typeof mock.BaseRouter.getInitialState).toBe("function");
    expect(typeof mock.BaseRouter.getRehydratedState).toBe("function");
    expect(typeof mock.BaseRouter.getStateForRouteNamesChange).toBe("function");
    expect(typeof mock.BaseRouter.getStateForRouteFocus).toBe("function");
    expect(typeof mock.BaseRouter.getStateForAction).toBe("function");
    expect(typeof mock.BaseRouter.shouldActionChangeFocus).toBe("function");
  });

  it("BaseRouter.shouldActionChangeFocus returns false", () => {
    expect(mock.BaseRouter.shouldActionChangeFocus()).toBe(false);
  });

  it("findFocusedRoute extracts the focused route from state", () => {
    const state = { index: 1, routes: [{ name: "A" }, { name: "B" }] };
    expect(mock.findFocusedRoute(state)).toEqual({ name: "B" });
  });

  it("getFocusedRouteNameFromRoute extracts nested route name", () => {
    const route = { state: { index: 0, routes: [{ name: "Nested" }] } };
    expect(mock.getFocusedRouteNameFromRoute(route)).toBe("Nested");
  });

  it("getActionFromState returns undefined", () => {
    expect(mock.getActionFromState({})).toBeUndefined();
  });

  it("getPathFromState returns a path string", () => {
    expect(mock.getPathFromState({})).toBe("/");
  });

  it("getStateFromPath returns undefined", () => {
    expect(mock.getStateFromPath("/test")).toBeUndefined();
  });

  it("useStateForPath returns undefined", () => {
    expect(mock.useStateForPath()).toBeUndefined();
  });

  it("validatePathConfig is callable without throwing", () => {
    expect(() => mock.validatePathConfig({})).not.toThrow();
  });

  it("createNavigatorFactory returns a function", () => {
    expect(typeof mock.createNavigatorFactory()).toBe("function");
  });

  it("useNavigationBuilder returns state, navigation, descriptors", async () => {
    const { result } = await renderHook(() => mock.useNavigationBuilder());
    expect(result.current.state).toBeDefined();
    expect(result.current.state.routes).toEqual([]);
    expect(result.current.navigation).toBeDefined();
    expect(typeof result.current.navigation.navigate).toBe("function");
    expect(result.current.descriptors).toEqual({});
    expect(typeof result.current.NavigationContent).toBe("function");
  });

  it("BaseNavigationContainer is renderable with displayName", () => {
    expect(mock.BaseNavigationContainer).toBeDefined();
    expect((mock.BaseNavigationContainer as any).displayName).toBe("BaseNavigationContainer");
  });

  it("useNavigationIndependentTree returns true", () => {
    expect(mock.useNavigationIndependentTree()).toBe(true);
  });

  it("PreventRemoveProvider passes through children", () => {
    const children = "test";
    expect(mock.PreventRemoveProvider({ children })).toBe(children);
  });

  it("usePreventRemove is callable", () => {
    expect(typeof mock.usePreventRemove).toBe("function");
    expect(() => mock.usePreventRemove()).not.toThrow();
  });

  it("usePreventRemoveContext gives an empty context outside a navigator, or the one provided", async () => {
    const empty = (await renderHook(() => mock.usePreventRemoveContext())).result.current;
    expect(empty.preventedRoutes).toEqual({});
    expect(typeof empty.setPreventRemove).toBe("function");
    expect(typeof empty.notifyPreventRemove).toBe("function");
    const provided = { preventedRoutes: { a: { preventRemove: true } } };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(mock.PreventRemoveContext.Provider, { value: provided }, children);
    expect(
      (await renderHook(() => mock.usePreventRemoveContext(), { wrapper })).result.current,
    ).toBe(provided);
  });

  it("createComponentForStaticNavigation returns a component", () => {
    const Component = mock.createComponentForStaticNavigation();
    expect(typeof Component).toBe("function");
    expect(Component()).toBeNull();
  });

  it("createPathConfigForStaticNavigation returns an object", () => {
    expect(mock.createPathConfigForStaticNavigation()).toEqual({});
  });

  describe("@react-navigation/native-stack", () => {
    const stackMock = preset.modules["@react-navigation/native-stack"].factory({ React });
    const stack = stackMock.createNativeStackNavigator();

    it("createNativeStackScreen returns the screen config, and NativeStackView is a view", () => {
      const config = { screen: () => null };
      expect(stackMock.createNativeStackScreen(config)).toBe(config);
      expect((stackMock.NativeStackView as any).displayName).toBe("NativeStackView");
    });

    it("useAnimatedHeaderHeight gives the engine's Animated value, kept across renders", async () => {
      const { result, rerender } = await renderHook(() => stackMock.useAnimatedHeaderHeight());
      const first = result.current;
      expect(typeof first.interpolate).toBe("function");
      // A card screen's iOS header on a portrait phone, with no top inset.
      expect(first.__getValue()).toBe(44);
      await rerender({});
      expect(result.current).toBe(first);
    });

    it("useAnimatedHeaderHeight starts at native-stack's 56 on Android", async () => {
      setPlatform("android");
      try {
        const { result } = await renderHook(() => stackMock.useAnimatedHeaderHeight());
        expect(result.current.__getValue()).toBe(56);
      } finally {
        setPlatform("ios");
      }
    });

    it("createNativeStackNavigator returns Navigator, Screen, Group", () => {
      expect(stack.Navigator).toBeDefined();
      expect(stack.Screen).toBeDefined();
      expect(stack.Group).toBeDefined();
    });

    it("Screen renders the component prop with route and navigation", async () => {
      let receivedProps: any = null;
      const TestComp = (props: any) => {
        receivedProps = props;
        return React.createElement("View");
      };
      const { render } = require("@testing-library/react-native");
      await render(
        React.createElement(stack.Screen, {
          name: "Home",
          component: TestComp,
          initialParams: { id: 42 },
        }),
      );
      expect(receivedProps).not.toBeNull();
      expect(receivedProps.route.name).toBe("Home");
      expect(receivedProps.route.key).toBe("Home");
      expect(receivedProps.route.params).toEqual({ id: 42 });
      expect(typeof receivedProps.navigation.navigate).toBe("function");
      expect(typeof receivedProps.navigation.goBack).toBe("function");
      // React Navigation 7's screen helpers, and no emit: core strips it.
      expect(typeof receivedProps.navigation.preload).toBe("function");
      expect(receivedProps.navigation).not.toHaveProperty("emit");
    });

    it("useNavigation/useRoute inside a Screen match the Screen's props", async () => {
      let hookNav: any = null;
      let hookRoute: any = null;
      let propNav: any = null;
      let propRoute: any = null;
      const TestComp = (props: any) => {
        propNav = props.navigation;
        propRoute = props.route;
        hookNav = mock.useNavigation();
        hookRoute = mock.useRoute();
        return React.createElement("View");
      };
      const { render } = require("@testing-library/react-native");
      await render(
        React.createElement(stack.Screen, {
          name: "Settings",
          component: TestComp,
          initialParams: { theme: "dark" },
        }),
      );
      // Hooks should return the same navigation/route as the props
      expect(hookNav).toBe(propNav);
      expect(hookRoute).toBe(propRoute);
      expect(hookRoute.name).toBe("Settings");
      expect(hookRoute.params).toEqual({ theme: "dark" });
    });

    it("Screen calls render-function children with route and navigation", async () => {
      let receivedProps: any = null;
      const { render } = require("@testing-library/react-native");
      await render(
        React.createElement(stack.Screen, { name: "Detail" }, (props: any) => {
          receivedProps = props;
          return React.createElement("View");
        }),
      );
      expect(receivedProps).not.toBeNull();
      expect(receivedProps.route.name).toBe("Detail");
      expect(typeof receivedProps.navigation.navigate).toBe("function");
    });

    it("Screen passes through plain children", async () => {
      const { render } = require("@testing-library/react-native");
      const { toJSON } = await render(
        React.createElement(
          stack.Screen,
          { name: "Plain" },
          React.createElement("View", { testID: "child" }),
        ),
      );
      const tree = toJSON();
      expect(tree.type).toBe("Screen");
      expect(tree.children[0].type).toBe("View");
      expect(tree.children[0].props.testID).toBe("child");
    });
  });

  describe("@react-navigation/bottom-tabs", () => {
    const tabsMock = preset.modules["@react-navigation/bottom-tabs"].factory({ React });
    const tabs = tabsMock.createBottomTabNavigator();

    it("createBottomTabNavigator returns Navigator, Screen, Group", () => {
      expect(tabs.Navigator).toBeDefined();
      expect(tabs.Screen).toBeDefined();
      expect(tabs.Group).toBeDefined();
    });

    it("Screen renders the component prop with route and navigation", async () => {
      let receivedProps: any = null;
      const TestComp = (props: any) => {
        receivedProps = props;
        return React.createElement("View");
      };
      const { render } = require("@testing-library/react-native");
      await render(
        React.createElement(tabs.Screen, {
          name: "Feed",
          component: TestComp,
          initialParams: { tab: "home" },
        }),
      );
      expect(receivedProps).not.toBeNull();
      expect(receivedProps.route.name).toBe("Feed");
      expect(receivedProps.route.params).toEqual({ tab: "home" });
      expect(typeof receivedProps.navigation.navigate).toBe("function");
    });
  });

  it("useScrollToTop is callable", () => {
    expect(typeof mock.useScrollToTop).toBe("function");
  });

  it("DrawerActions has expected methods", () => {
    expect(typeof mock.DrawerActions.openDrawer).toBe("function");
    expect(typeof mock.DrawerActions.closeDrawer).toBe("function");
    expect(typeof mock.DrawerActions.toggleDrawer).toBe("function");
  });

  describe("@react-navigation/drawer", () => {
    const drawerMock = preset.modules["@react-navigation/drawer"].factory({ React });
    const drawer = drawerMock.createDrawerNavigator();

    it("createDrawerNavigator returns Navigator, Screen, Group", () => {
      expect(drawer.Navigator).toBeDefined();
      expect(drawer.Screen).toBeDefined();
      expect(drawer.Group).toBeDefined();
    });
  });

  describe("@react-navigation/elements", () => {
    const elementsMock = preset.modules["@react-navigation/elements"].factory({ React });

    it("Header components are renderable", () => {
      expect(elementsMock.Header.displayName).toBe("Header");
      expect(elementsMock.HeaderBackground.displayName).toBe("HeaderBackground");
      expect(elementsMock.HeaderBackButton.displayName).toBe("HeaderBackButton");
      expect(elementsMock.HeaderTitle.displayName).toBe("HeaderTitle");
    });

    it("useHeaderHeight returns a number", () => {
      expect(elementsMock.useHeaderHeight()).toBe(64);
    });

    it("getDefaultHeaderHeight is the library's: per platform, orientation and modal, plus the status bar", () => {
      const portrait = { width: 390, height: 844 };
      const height = elementsMock.getDefaultHeaderHeight;
      expect(height(portrait, false, 47)).toBe(91);
      expect(height(portrait, true, 0)).toBe(56);
      expect(height({ width: 844, height: 390 }, false, 0)).toBe(32);
      // A Dynamic Island's inset is taller than its status bar.
      const { PixelRatio } = (globalThis as any).__vitest_native_mock;
      expect(height(portrait, false, 59)).toBe(44 + (59 - (5 + 1 / PixelRatio.get())));
      const { Platform } = (globalThis as any).__vitest_native_mock;
      const isPad = Object.getOwnPropertyDescriptor(Platform, "isPad");
      Object.defineProperty(Platform, "isPad", { configurable: true, value: true });
      try {
        expect(height(portrait, false, 24)).toBe(74);
        expect(height(portrait, true, 24)).toBe(80);
      } finally {
        if (isPad) Object.defineProperty(Platform, "isPad", isPad);
        else delete Platform.isPad;
      }
      setPlatform("android");
      try {
        expect(height(portrait, false, 24)).toBe(88);
        expect(height(portrait, false, 59)).toBe(123);
      } finally {
        setPlatform("ios");
      }
    });

    it("getHeaderTitle extracts title from options", () => {
      expect(elementsMock.getHeaderTitle({ title: "Home" }, "Fallback")).toBe("Home");
      expect(elementsMock.getHeaderTitle({}, "Fallback")).toBe("Fallback");
      expect(elementsMock.getHeaderTitle({ headerTitle: "Custom" }, "Fallback")).toBe("Custom");
    });
  });
});

// --- Reanimated ---

describe("preset: reanimated", () => {
  const preset = reanimated();
  const mock = preset.modules["react-native-reanimated"].factory({ React });

  it("useSharedValue is a function (uses React.useRef internally, must be called in component)", () => {
    expect(typeof mock.useSharedValue).toBe("function");
  });

  // Test SharedValue shape via the factory's createSharedValue (exposed through useDerivedValue)
  it("SharedValue has get()/set() methods (React Compiler compatible)", () => {
    const sv = mock.useDerivedValue(() => 42);
    expect(typeof sv.get).toBe("function");
    expect(typeof sv.set).toBe("function");
    expect(sv.get()).toBe(42);
    sv.set(100);
    expect(sv.value).toBe(100);
    expect(sv.get()).toBe(100);
  });

  it("SharedValue.set() accepts an updater function", () => {
    const sv = mock.useDerivedValue(() => 10);
    sv.set((prev: number) => prev + 5);
    expect(sv.value).toBe(15);
  });

  it("SharedValue has addListener/removeListener", () => {
    const sv = mock.useDerivedValue(() => 0);
    let received: any = null;
    sv.addListener(1, (val: any) => {
      received = val;
    });
    sv.set(99);
    expect(received).toBe(99);
    sv.removeListener(1);
    sv.set(200);
    expect(received).toBe(99); // listener removed, not updated
  });

  // Reanimated 4.7.1's modify (src/mutables.ts) stores what the modifier returns:
  // valueSetter(mutable, modifier(mutable.value), forceUpdate). Its documented use mutates
  // the value in place and returns it.
  it("SharedValue.modify keeps what the modifier returns, as Reanimated's does", () => {
    const sv = mock.useDerivedValue(() => ({ x: 1 }));
    sv.modify((obj: any) => {
      obj.x = 5;
      return obj;
    });
    expect(sv.value.x).toBe(5);
    sv.modify((obj: any) => ({ x: obj.x + 1 }));
    expect(sv.value).toEqual({ x: 6 });
  });

  it("useAnimatedStyle calls the updater and returns result", () => {
    const style = mock.useAnimatedStyle(() => ({ opacity: 0.5 }));
    expect(style).toEqual({ opacity: 0.5 });
  });

  it("useDerivedValue returns wrapped value", () => {
    const derived = mock.useDerivedValue(() => "hello");
    expect(derived.value).toBe("hello");
  });

  it("withTiming returns the target value", () => {
    expect(mock.withTiming(1)).toBe(1);
  });

  it("withTiming calls the callback", () => {
    let called = false;
    mock.withTiming(1, undefined, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("withSpring returns the target value", () => {
    expect(mock.withSpring(5)).toBe(5);
  });

  it("withSequence returns the last value", () => {
    expect(mock.withSequence(1, 2, 3)).toBe(3);
  });

  it("withDelay passes through the value", () => {
    expect(mock.withDelay(500, 42)).toBe(42);
  });

  it("runOnJS returns the function itself", () => {
    const fn = () => "test";
    expect(mock.runOnJS(fn)).toBe(fn);
  });

  it("createAnimatedComponent wraps a component", () => {
    const Base = () => null;
    Base.displayName = "MyView";
    const Animated = mock.createAnimatedComponent(Base);
    expect(Animated.displayName).toBe("Animated(MyView)");
  });

  it("exposes Animated.View/Text/Image/ScrollView/FlatList components", () => {
    for (const name of ["View", "Text", "Image", "ScrollView", "FlatList"] as const) {
      expect(mock.default[name]).toBeDefined();
      // forwardRef components are objects with a render fn, not plain functions.
      expect(["object", "function"]).toContain(typeof mock.default[name]);
      expect(mock.default[name].displayName).toBe(`Animated.${name}`);
      // Only on the default, as in the real package — `import { View } from
      // 'react-native-reanimated'` does not resolve under Metro.
      expect(mock[name]).toBeUndefined();
    }
    expect(typeof mock.default.createAnimatedComponent).toBe("function");
  });

  it("interpolate is callable", () => {
    const result = mock.interpolate(0.5, [0, 1], [0, 100]);
    expect(typeof result).toBe("number");
  });

  it("Easing functions are callable", () => {
    expect(typeof mock.Easing.linear).toBe("function");
    expect(typeof mock.Easing.ease).toBe("function");
    expect(typeof mock.Easing.bezier).toBe("function");
  });

  it("FadeIn/FadeOut have chainable methods", () => {
    const result = mock.FadeIn.duration(300).delay(100);
    expect(result).toBeDefined();
  });

  it("all entering/exiting animations are chainable", () => {
    const anims = [
      "FadeIn",
      "FadeOut",
      "FadeInDown",
      "FadeInUp",
      "FadeInLeft",
      "FadeInRight",
      "FadeOutDown",
      "FadeOutUp",
      "FadeOutLeft",
      "FadeOutRight",
      "SlideInRight",
      "SlideInLeft",
      "SlideInUp",
      "SlideInDown",
      "SlideOutRight",
      "SlideOutLeft",
      "SlideOutUp",
      "SlideOutDown",
      "ZoomIn",
      "ZoomOut",
      "BounceIn",
      "BounceOut",
      "BounceInDown",
      "BounceInUp",
      "BounceInLeft",
      "BounceInRight",
      "FlipInEasyX",
      "FlipInEasyY",
      "FlipOutEasyX",
      "FlipOutEasyY",
      "LightSpeedInLeft",
      "LightSpeedInRight",
      "LightSpeedOutLeft",
      "LightSpeedOutRight",
      "PinwheelIn",
      "PinwheelOut",
      "StretchInX",
      "StretchInY",
      "StretchOutX",
      "StretchOutY",
      "RotateInDownLeft",
      "RotateInDownRight",
      "RotateInUpLeft",
      "RotateInUpRight",
      "RotateOutDownLeft",
      "RotateOutDownRight",
      "RotateOutUpLeft",
      "RotateOutUpRight",
    ];
    for (const name of anims) {
      const anim = mock[name];
      expect(anim, `${name} should exist`).toBeDefined();
      expect(typeof anim.duration, `${name}.duration should be a function`).toBe("function");
      const chained = anim.duration(300);
      expect(chained, `${name}.duration() should return self`).toBe(anim);
    }
  });

  it("layout transitions are chainable", () => {
    const transitions = [
      "Layout",
      "LinearTransition",
      "SequencedTransition",
      "FadingTransition",
      "JumpingTransition",
      "CurvedTransition",
      "EntryExitTransition",
    ];
    for (const name of transitions) {
      expect(mock[name], `${name} should exist`).toBeDefined();
      expect(typeof mock[name].duration, `${name}.duration`).toBe("function");
    }
  });

  it("useAnimatedReaction is callable", () => {
    expect(typeof mock.useAnimatedReaction).toBe("function");
    expect(() =>
      mock.useAnimatedReaction(
        () => 1,
        () => {},
      ),
    ).not.toThrow();
  });

  it("useAnimatedKeyboard returns shared values", () => {
    const keyboard = mock.useAnimatedKeyboard();
    expect(keyboard.state).toBeDefined();
    expect(keyboard.height).toBeDefined();
    expect(keyboard.state.value).toBe(0);
    expect(keyboard.height.value).toBe(0);
  });

  it("useReducedMotion returns false", () => {
    expect(mock.useReducedMotion()).toBe(false);
  });

  it("useFrameCallback returns controller", () => {
    const ctrl = mock.useFrameCallback(() => {});
    expect(typeof ctrl.setActive).toBe("function");
    expect(ctrl.isActive).toBe(false);
  });

  it("makeMutable creates a shared value", () => {
    const sv = mock.makeMutable(42);
    expect(sv.value).toBe(42);
    sv.set(100);
    expect(sv.value).toBe(100);
  });

  it("ReduceMotion has expected constants", () => {
    expect(mock.ReduceMotion.System).toBe("system");
    expect(mock.ReduceMotion.Always).toBe("always");
    expect(mock.ReduceMotion.Never).toBe("never");
  });

  it("KeyboardState has expected constants", () => {
    expect(mock.KeyboardState.OPEN).toBe(2);
    expect(mock.KeyboardState.CLOSED).toBe(4);
  });

  it("Extrapolation has expected constants", () => {
    expect(mock.Extrapolation.CLAMP).toBe("clamp");
    expect(mock.Extrapolation.EXTEND).toBe("extend");
  });
});

// --- Gesture Handler ---

describe("preset: gestureHandler", () => {
  const preset = gestureHandler();
  const mock = preset.modules["react-native-gesture-handler"].factory({ React });

  it("State has expected enum values", () => {
    expect(mock.State.UNDETERMINED).toBe(0);
    expect(mock.State.BEGAN).toBe(2);
    expect(mock.State.ACTIVE).toBe(4);
    expect(mock.State.END).toBe(5);
  });

  it("Directions has expected enum values", () => {
    expect(mock.Directions.RIGHT).toBe(1);
    expect(mock.Directions.LEFT).toBe(2);
    expect(mock.Directions.UP).toBe(4);
    expect(mock.Directions.DOWN).toBe(8);
  });

  it("Gesture.Pan returns a chainable gesture config", () => {
    const pan = mock.Gesture.Pan();
    const result = pan
      .onStart(() => {})
      .onUpdate(() => {})
      .onEnd(() => {});
    expect(result).toBeDefined();
  });

  it("Gesture.Tap returns a chainable gesture config", () => {
    const tap = mock.Gesture.Tap();
    const result = tap.numberOfTaps(2).onEnd(() => {});
    expect(result).toBeDefined();
  });

  it("GestureHandlerRootView is renderable", () => {
    expect(mock.GestureHandlerRootView).toBeDefined();
    expect(mock.GestureHandlerRootView.displayName).toBe("GestureHandlerRootView");
  });

  it("GestureDetector is renderable", () => {
    expect(mock.GestureDetector).toBeDefined();
    expect(mock.GestureDetector.displayName).toBe("GestureDetector");
  });

  it("legacy handlers are renderable components", () => {
    expect(mock.PanGestureHandler.displayName).toBe("PanGestureHandler");
    expect(mock.TapGestureHandler.displayName).toBe("TapGestureHandler");
    expect(mock.LongPressGestureHandler.displayName).toBe("LongPressGestureHandler");
  });

  it("gestureHandlerRootHOC passes through the component", () => {
    const MyComponent = () => null;
    expect(mock.gestureHandlerRootHOC(MyComponent)).toBe(MyComponent);
  });

  it("exposes a Pressable component", () => {
    expect(mock.Pressable).toBeDefined();
    expect(mock.Pressable.displayName).toBe("Pressable");
  });

  it("exposes the Button components (RectButton, BaseButton, …)", () => {
    for (const name of [
      "RectButton",
      "BaseButton",
      "BorderlessButton",
      "RawButton",
      "PureNativeButton",
    ] as const) {
      expect(mock[name], `${name} should be defined`).toBeDefined();
      expect(mock[name].displayName).toBe(name);
    }
  });
});

// --- Safe Area Context ---

describe("preset: safeAreaContext", () => {
  const preset = safeAreaContext();
  const mock = preset.modules["react-native-safe-area-context"].factory({ React });

  // The hooks read context, so they run inside a render.
  const insetsNow = async (wrapper?: React.ComponentType<{ children: React.ReactNode }>) =>
    (await renderHook(() => mock.useSafeAreaInsets(), { wrapper })).result.current;

  it("useSafeAreaInsets returns realistic insets", async () => {
    const insets = await insetsNow();
    expect(insets).toHaveProperty("top");
    expect(insets).toHaveProperty("bottom");
    expect(insets).toHaveProperty("left");
    expect(insets).toHaveProperty("right");
    expect(insets.top).toBeGreaterThan(0); // iPhone notch
    expect(insets.bottom).toBeGreaterThan(0); // Home indicator
  });

  it("useSafeAreaFrame returns realistic frame", async () => {
    const frame = (await renderHook(() => mock.useSafeAreaFrame())).result.current;
    expect(frame.width).toBe(390);
    expect(frame.height).toBe(844);
  });

  it("SafeAreaProvider is renderable", () => {
    expect(mock.SafeAreaProvider.displayName).toBe("SafeAreaProvider");
  });

  it("SafeAreaView is renderable", () => {
    expect(mock.SafeAreaView.displayName).toBe("SafeAreaView");
  });

  it("initialWindowMetrics has frame and insets", () => {
    expect(mock.initialWindowMetrics).toHaveProperty("frame");
    expect(mock.initialWindowMetrics).toHaveProperty("insets");
  });

  it("withSafeAreaInsets wraps a component", () => {
    const Base = () => null;
    Base.displayName = "MyComp";
    const Wrapped = mock.withSafeAreaInsets(Base);
    expect(Wrapped.displayName).toBe("withSafeAreaInsets(MyComp)");
  });

  it("serves 5.11's corner-adapted context, and cornerAdaptation answers the regular insets", async () => {
    expect(mock.SafeAreaCornerAdaptedInsetsContext).toHaveProperty("Provider");
    const adapted = (
      await renderHook(() => mock.useSafeAreaInsets({ cornerAdaptation: "vertical" }))
    ).result.current;
    expect(adapted).toEqual(await insetsNow());
  });

  it("_setInsets updates insets returned by useSafeAreaInsets", async () => {
    mock._setInsets({ top: 0, bottom: 0 });
    const insets = await insetsNow();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
  });

  it("_reset restores default insets", async () => {
    mock._setInsets({ top: 0, bottom: 0 });
    mock._reset();
    const insets = await insetsNow();
    expect(insets.top).toBe(47);
    expect(insets.bottom).toBe(34);
  });

  it("cornerAdaptation reads a SafeAreaCornerAdaptedInsetsContext.Provider", async () => {
    const vertical = { top: 9, right: 0, bottom: 9, left: 0 };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        mock.SafeAreaCornerAdaptedInsetsContext.Provider,
        { value: { vertical } },
        children,
      );
    const { result } = await renderHook(
      () => mock.useSafeAreaInsets({ cornerAdaptation: "vertical" }),
      { wrapper },
    );
    expect(result.current).toBe(vertical);
  });

  it("SafeAreaProvider's initialMetrics reach the hooks; a null provider value falls back", async () => {
    const insets = { top: 5, right: 6, bottom: 7, left: 8 };
    const frame = { x: 0, y: 0, width: 100, height: 200 };
    const withMetrics = ({ children }: { children: React.ReactNode }) =>
      React.createElement(mock.SafeAreaProvider, { initialMetrics: { insets, frame } }, children);
    expect(await insetsNow(withMetrics)).toEqual(insets);
    expect(
      (await renderHook(() => mock.useSafeAreaFrame(), { wrapper: withMetrics })).result.current,
    ).toEqual(frame);
    const nullValue = ({ children }: { children: React.ReactNode }) =>
      React.createElement(mock.SafeAreaInsetsContext.Provider, { value: null }, children);
    expect((await insetsNow(nullValue)).top).toBe(47);
  });

  it("useSafeAreaInsets reads a SafeAreaInsetsContext.Provider, as the library's does", async () => {
    const value = { top: 1, right: 2, bottom: 3, left: 4 };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(mock.SafeAreaInsetsContext.Provider, { value }, children);
    expect(await insetsNow(wrapper)).toBe(value);
  });
});

// --- Async Storage ---

describe("preset: asyncStorage", () => {
  const preset = asyncStorage();
  const mock = preset.modules["@react-native-async-storage/async-storage"].factory({ React });

  it("setItem and getItem work together", async () => {
    await mock.setItem("key1", "value1");
    const result = await mock.getItem("key1");
    expect(result).toBe("value1");
  });

  it("getItem returns null for missing keys", async () => {
    const result = await mock.getItem("nonexistent");
    expect(result).toBeNull();
  });

  it("removeItem deletes a key", async () => {
    await mock.setItem("temp", "data");
    await mock.removeItem("temp");
    const result = await mock.getItem("temp");
    expect(result).toBeNull();
  });

  it("clear removes all items", async () => {
    await mock.setItem("a", "1");
    await mock.setItem("b", "2");
    await mock.clear();
    const keys = await mock.getAllKeys();
    expect(keys).toEqual([]);
  });

  it("getAllKeys returns stored keys", async () => {
    await mock.clear();
    await mock.setItem("x", "1");
    await mock.setItem("y", "2");
    const keys = await mock.getAllKeys();
    expect(keys).toContain("x");
    expect(keys).toContain("y");
  });

  it("multiGet returns values for multiple keys", async () => {
    await mock.clear();
    await mock.setItem("k1", "v1");
    await mock.setItem("k2", "v2");
    const result = await mock.multiGet(["k1", "k2", "k3"]);
    expect(result).toEqual([
      ["k1", "v1"],
      ["k2", "v2"],
      ["k3", null],
    ]);
  });

  it("multiSet stores multiple key-value pairs", async () => {
    await mock.clear();
    await mock.multiSet([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(await mock.getItem("a")).toBe("1");
    expect(await mock.getItem("b")).toBe("2");
  });

  it("mergeItem deep-merges JSON values", async () => {
    await mock.setItem("obj", JSON.stringify({ a: 1, b: 2 }));
    await mock.mergeItem("obj", JSON.stringify({ b: 3, c: 4 }));
    const result = JSON.parse((await mock.getItem("obj"))!);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("_resetStore clears all data between tests", async () => {
    await mock.setItem("persist", "data");
    mock._resetStore();
    const result = await mock.getItem("persist");
    expect(result).toBeNull();
    const keys = await mock.getAllKeys();
    expect(keys).toEqual([]);
  });
});

// --- Screens ---

describe("preset: screens", () => {
  const preset = screens();
  const mock = preset.modules["react-native-screens"].factory({ React });

  it("enableScreens is callable", () => {
    expect(() => mock.enableScreens()).not.toThrow();
    expect(mock.screensEnabled()).toBe(true);
  });

  it("enableScreens(false) disables screens", () => {
    mock.enableScreens(false);
    expect(mock.screensEnabled()).toBe(false);
    mock.enableScreens(true); // restore
  });

  it("Screen is a renderable component", () => {
    expect(mock.Screen.displayName).toBe("Screen");
  });

  it("ScreenContainer is a renderable component", () => {
    expect(mock.ScreenContainer.displayName).toBe("ScreenContainer");
  });

  it("ScreenStack is a renderable component", () => {
    expect(mock.ScreenStack.displayName).toBe("ScreenStack");
  });
});

// --- Expo ---

describe("preset: expo", () => {
  describe("expo-constants", () => {
    const preset = expo();
    const mock = preset.modules["expo-constants"].factory({ React });
    // Constants values live on the default export, as they do in the real package.
    const Constants = mock.default;

    it("has expoConfig with app metadata", () => {
      expect(Constants.expoConfig).toBeDefined();
      expect(Constants.expoConfig.name).toBe("test-app");
      expect(Constants.expoConfig.slug).toBe("test-app");
      expect(Constants.expoConfig.version).toBe("1.0.0");
    });

    it("isDevice is true", () => {
      expect(Constants.isDevice).toBe(true);
    });

    it("getWebViewUserAgentAsync resolves", async () => {
      const result = await Constants.getWebViewUserAgentAsync();
      expect(typeof result).toBe("string");
    });

    it("does not expose Constants properties as named exports", () => {
      // The real package exports only the three enums and a default; a named
      // import of expoConfig resolves under Metro to undefined.
      expect(mock.expoConfig).toBeUndefined();
      expect(mock.isDevice).toBeUndefined();
    });

    it("exposes the enums the real package exports", () => {
      expect(mock.ExecutionEnvironment.StoreClient).toBe("storeClient");
      expect(mock.AppOwnership.Expo).toBe("expo");
      expect(mock.UserInterfaceIdiom.Handset).toBe("handset");
    });
  });

  describe("expo-font", () => {
    const preset = expo();
    const mock = preset.modules["expo-font"].factory({ React });

    it("useFonts returns [loaded, null]", () => {
      const [loaded, error] = mock.useFonts();
      expect(loaded).toBe(true);
      expect(error).toBeNull();
    });

    it("isLoaded returns true", () => {
      expect(mock.isLoaded()).toBe(true);
    });
  });

  describe("expo-asset", () => {
    const preset = expo();
    const mock = preset.modules["expo-asset"].factory({ React });

    it("Asset.fromModule returns asset-like object", () => {
      const asset = mock.Asset.fromModule(42);
      expect(asset.uri).toContain("42");
      expect(asset.width).toBe(100);
      expect(asset.height).toBe(100);
      expect(typeof asset.downloadAsync).toBe("function");
    });
  });

  describe("expo-splash-screen", () => {
    const preset = expo();
    const mock = preset.modules["expo-splash-screen"].factory({ React });

    it("preventAutoHideAsync resolves", async () => {
      await expect(mock.preventAutoHideAsync()).resolves.toBe(true);
    });

    it("hideAsync resolves", async () => {
      await expect(mock.hideAsync()).resolves.toBe(true);
    });

    it("has hide and setOptions, Expo's synchronous calls since SDK 52", () => {
      expect(preset.modules["expo-splash-screen"].exports).toEqual(
        expect.arrayContaining(["hide", "setOptions"]),
      );
      expect(mock.hide()).toBeUndefined();
      expect(mock.setOptions({ duration: 400, fade: true })).toBeUndefined();
      expect(mock.setOptions).toHaveBeenCalledWith({ duration: 400, fade: true });
    });
  });

  describe("expo-linking", () => {
    const preset = expo();
    const mock = preset.modules["expo-linking"].factory({ React });

    it("createURL returns an expo URL", () => {
      const url = mock.createURL("home");
      expect(url).toContain("home");
    });

    it("parse returns URL parts", () => {
      const parsed = mock.parse("https://example.com/test");
      expect(parsed).toHaveProperty("scheme");
      expect(parsed).toHaveProperty("hostname");
      expect(parsed).toHaveProperty("path");
    });

    // expo-router 58 calls these while seeding a route tree's initial state.
    it("has no launch URL and opens URLs successfully", async () => {
      expect(mock.getLinkingURL()).toBeNull();
      await expect(mock.openURL("https://example.com")).resolves.toBe(true);
    });

    it("unwrapDevLaunchURL behaves as expo-linking documents it", () => {
      expect(
        mock.unwrapDevLaunchURL(
          "myapp://expo-development-client/?url=http%3A%2F%2F10.0.0.5%3A8081%2F--%2Fprofile",
        ),
      ).toBe("http://10.0.0.5:8081/--/profile");
      expect(mock.unwrapDevLaunchURL("myapp://login?__expo_disable_fab=1")).toBe("myapp://login");
      expect(mock.unwrapDevLaunchURL("myapp://x?__expo_url=myapp%3A%2F%2Fy")).toBe("myapp://y");
      expect(mock.unwrapDevLaunchURL("myapp://expo-development-client/")).toBe("");
      expect(mock.unwrapDevLaunchURL("myapp://home?tab=1")).toBe("myapp://home?tab=1");
      expect(mock.unwrapDevLaunchURL("not a url")).toBe("not a url");
    });
  });

  describe("expo-status-bar", () => {
    const preset = expo();
    const mock = preset.modules["expo-status-bar"].factory({ React });

    it("StatusBar is a renderable component", () => {
      expect(mock.StatusBar).toBeDefined();
      expect(mock.StatusBar.displayName).toBe("StatusBar");
    });

    it("setStatusBarStyle is callable", () => {
      expect(() => mock.setStatusBarStyle("dark")).not.toThrow();
    });

    it("setStatusBarHidden is callable", () => {
      expect(() => mock.setStatusBarHidden(true)).not.toThrow();
    });
  });
});

// --- Device Info ---

describe("preset: deviceInfo", () => {
  const mock = deviceInfo().modules["react-native-device-info"].factory({ React });

  it("default object exposes string getters that don't crash on .toLowerCase()", () => {
    expect(typeof mock.default.getBrandSync()).toBe("string");
    expect(() => mock.default.getBrandSync().toLowerCase()).not.toThrow();
  });

  it("sync convenience methods return primitives (hasNotch, getDeviceType)", () => {
    expect(typeof mock.default.hasNotch()).toBe("boolean");
    expect(typeof mock.default.getDeviceType()).toBe("string");
  });

  it("named getUniqueIdSync returns a string; getUniqueId resolves", async () => {
    expect(typeof mock.getUniqueIdSync()).toBe("string");
    await expect(mock.getUniqueId()).resolves.toBeTypeOf("string");
  });
});

// --- MMKV ---

describe("preset: mmkv", () => {
  const mock = mmkv().modules["react-native-mmkv"].factory({ React });

  it("MMKV instance round-trips values", () => {
    const m = new mock.MMKV();
    m.set("k", "v");
    expect(m.getString("k")).toBe("v");
    expect(m.contains("k")).toBe(true);
    m.delete("k");
    expect(m.getString("k")).toBeUndefined();
  });

  it("createMMKV returns independent stores", () => {
    const a = mock.createMMKV();
    const b = mock.createMMKV();
    a.set("x", 1);
    expect(a.getNumber("x")).toBe(1);
    expect(b.getNumber("x")).toBeUndefined();
  });

  it("exposes the MMKV hooks", () => {
    for (const h of ["useMMKVString", "useMMKVNumber", "useMMKVBoolean", "useMMKVObject"]) {
      expect(typeof mock[h]).toBe("function");
    }
  });
});

// --- SVG ---

describe("preset: svg", () => {
  const mock = svg().modules["react-native-svg"].factory({ React });

  it("default is Svg; core elements are renderable host components", () => {
    expect(mock.default).toBe(mock.Svg);
    for (const name of ["Svg", "Path", "Circle", "Rect", "G", "Defs"] as const) {
      expect(mock[name].displayName).toBe(name);
    }
  });
});

// --- WebView ---

describe("preset: webview", () => {
  const mock = webview().modules["react-native-webview"].factory({ React });

  it("exposes WebView as both default and named, renderable", () => {
    expect(mock.default).toBe(mock.WebView);
    expect(mock.WebView.displayName).toBe("WebView");
  });
});

// --- FlashList ---

describe("preset: flashList", () => {
  const mock = flashList().modules["@shopify/flash-list"].factory({ React });

  it("default is FlashList; list variants are renderable host components", () => {
    expect(mock.default).toBe(mock.FlashList);
    for (const name of ["FlashList", "AnimatedFlashList", "LayoutCommitObserver"] as const) {
      expect(mock[name].displayName).toBe(name);
    }
  });

  it("renders each data row through renderItem", async () => {
    const { render } = require("@testing-library/react-native");
    const { Text } = require("react-native");
    const { getByText } = await render(
      React.createElement(mock.FlashList, {
        data: ["alpha", "beta"],
        renderItem: ({ item }: { item: string }) => React.createElement(Text, null, item),
      }),
    );
    expect(getByText("alpha")).toBeTruthy();
    expect(getByText("beta")).toBeTruthy();
  });

  it("renders ListEmptyComponent when data is empty", async () => {
    const { render } = require("@testing-library/react-native");
    const { Text } = require("react-native");
    const { getByText } = await render(
      React.createElement(mock.FlashList, {
        data: [],
        renderItem: () => null,
        ListEmptyComponent: () => React.createElement(Text, null, "nothing here"),
      }),
    );
    expect(getByText("nothing here")).toBeTruthy();
  });

  it("exposes the imperative scroll surface via ref", async () => {
    const { render } = require("@testing-library/react-native");
    const ref = React.createRef<any>();
    await render(React.createElement(mock.FlashList, { data: [], renderItem: () => null, ref }));
    for (const method of ["scrollToEnd", "scrollToIndex", "scrollToOffset", "recordInteraction"]) {
      expect(typeof ref.current[method]).toBe("function");
    }
  });

  it("exposes the v2 RenderTargetOptions enum", () => {
    expect(mock.RenderTargetOptions).toEqual({
      Cell: "Cell",
      StickyHeader: "StickyHeader",
      Measurement: "Measurement",
    });
  });

  it("useRecyclingState / useLayoutState behave like useState", async () => {
    const recycling = await renderHook(() => mock.useRecyclingState(7));
    expect(recycling.result.current[0]).toBe(7);
    expect(typeof recycling.result.current[1]).toBe("function");
    const layout = await renderHook(() => mock.useLayoutState("a"));
    expect(layout.result.current[0]).toBe("a");
  });

  it("useMappingHelper and useFlashListContext are defined and callable", () => {
    expect(mock.useMappingHelper().getMappingKey("x", 3)).toBe("3");
    expect(mock.useFlashListContext()).toBeUndefined();
    expect(typeof mock.ViewToken).toBe("function");
  });
});

// --- Bottom Sheet ---

describe("preset: bottomSheet", () => {
  const mock = bottomSheet().modules["@gorhom/bottom-sheet"].factory({ React });

  it("default is BottomSheet; sheet containers are renderable host components", () => {
    expect(mock.default.displayName).toBe("BottomSheet");
    for (const name of [
      "BottomSheetModal",
      "BottomSheetView",
      "BottomSheetModalProvider",
      "BottomSheetHandle",
      "BottomSheetFooter",
    ] as const) {
      expect(mock[name].displayName).toBe(name);
    }
  });

  it("scrollable/input/touchable members are the real RN components", () => {
    expect(mock.BottomSheetScrollView.displayName).toBe("ScrollView");
    expect(mock.BottomSheetTextInput.displayName).toBe("TextInput");
    expect(mock.TouchableOpacity.displayName).toBe("TouchableOpacity");
  });

  it("BottomSheetFlatList renders its data rows", async () => {
    const { render } = require("@testing-library/react-native");
    const { Text } = require("react-native");
    const { getByText } = await render(
      React.createElement(mock.BottomSheetFlatList, {
        data: ["row-a", "row-b"],
        renderItem: ({ item }: { item: string }) => React.createElement(Text, null, item),
      }),
    );
    expect(getByText("row-a")).toBeTruthy();
    expect(getByText("row-b")).toBeTruthy();
  });

  it("exposes the public constant enums with the real, complete values", () => {
    expect(mock.SNAP_POINT_TYPE).toEqual({ PROVIDED: 0, DYNAMIC: 1 });
    expect(mock.SHEET_STATE).toEqual({
      CLOSED: 0,
      OPENED: 1,
      EXTENDED: 2,
      OVER_EXTENDED: 3,
      FILL_PARENT: 4,
    });
    expect(mock.SCROLLABLE_TYPE.SCROLLVIEW).toBe(3);
    expect(mock.ANIMATION_SOURCE.KEYBOARD).toBe(6);
    expect(mock.ANIMATION_SOURCE.SNAP_POINT_CHANGE).toBe(5);
  });

  it("useBottomSheet exposes the sheet control methods + animated values", async () => {
    const { result } = await renderHook(() => mock.useBottomSheet());
    const sheet = result.current;
    for (const method of ["expand", "collapse", "close", "snapToIndex", "forceClose"]) {
      expect(typeof sheet[method]).toBe("function");
    }
    expect(sheet.animatedIndex).toEqual({ value: 0 });
  });

  it("useBottomSheetModal / useBottomSheetModalInternal are defined", async () => {
    const { result } = await renderHook(() => mock.useBottomSheetModal());
    result.current.dismiss();
    expect(result.current.dismiss).toHaveBeenCalled();
    expect(typeof result.current.dismissAll).toBe("function");
    expect(mock.useBottomSheetModalInternal()).toEqual({});
  });

  it("config hooks return their input unchanged", () => {
    const config = { damping: 80 };
    expect(mock.useBottomSheetSpringConfigs(config)).toBe(config);
    expect(mock.useBottomSheetTimingConfigs(config)).toBe(config);
  });

  it("BottomSheetModal ref exposes present/dismiss", async () => {
    const { render } = require("@testing-library/react-native");
    const ref = React.createRef<any>();
    await render(React.createElement(mock.BottomSheetModal, { ref }));
    expect(typeof ref.current.present).toBe("function");
    expect(typeof ref.current.dismiss).toBe("function");
  });
});

// --- Keyboard Controller ---

describe("preset: keyboardController", () => {
  const mock = keyboardController().modules["react-native-keyboard-controller"].factory({ React });

  it("provider + native views are renderable host components", () => {
    for (const name of [
      "KeyboardProvider",
      "KeyboardControllerView",
      "OverKeyboardView",
      "KeyboardGestureArea",
    ] as const) {
      expect(mock[name].displayName).toBe(name);
    }
  });

  it("layout components are backed by real RN View/ScrollView", () => {
    expect(mock.KeyboardStickyView.displayName).toBe("View");
    expect(mock.KeyboardAvoidingView.displayName).toBe("View");
    expect(mock.KeyboardAwareScrollView.displayName).toBe("ScrollView");
  });

  it("KeyboardToolbar is a View with named sub-components", () => {
    expect(mock.KeyboardToolbar.displayName).toBe("View");
    expect(mock.KeyboardToolbar.Done.displayName).toBe("KeyboardToolbar.Done");
  });

  it("KeyboardController exposes the inert imperative surface incl. preload", () => {
    expect(mock.KeyboardController.isVisible()).toBe(false);
    mock.KeyboardController.dismiss();
    expect(mock.KeyboardController.dismiss).toHaveBeenCalled();
    expect(typeof mock.KeyboardController.preload).toBe("function");
    expect(mock.KeyboardController.state()).toMatchObject({ height: 0, type: "default" });
  });

  it("KeyboardEvents.addListener returns a removable subscription", () => {
    const sub = mock.KeyboardEvents.addListener("keyboardWillShow", () => {});
    expect(typeof sub.remove).toBe("function");
  });

  it("reanimated-backed hooks return shared-value handles", async () => {
    const { result } = await renderHook(() => mock.useReanimatedKeyboardAnimation());
    expect(result.current.height.value).toBe(0);
    expect(result.current.progress.value).toBe(0);
  });

  it("useKeyboardState supports a selector; useKeyboardContext returns the values", () => {
    expect(mock.useKeyboardState()).toMatchObject({ isVisible: false });
    expect(mock.useKeyboardState((s: any) => s.isVisible)).toBe(false);
    expect(mock.useKeyboardContext()).toHaveProperty("reanimated");
  });

  it("useKeyboardController returns enabled + setEnabled", async () => {
    const { result } = await renderHook(() => mock.useKeyboardController());
    expect(result.current.enabled).toBe(true);
    expect(typeof result.current.setEnabled).toBe("function");
  });

  it("exposes AndroidSoftInputModes + DefaultKeyboardToolbarTheme", () => {
    expect(mock.AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE).toBe(16);
    expect(mock.DefaultKeyboardToolbarTheme.light).toBeDefined();
    expect(mock.DefaultKeyboardToolbarTheme.dark).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Wiring: the auto-detect map must agree with the presets it names
// ---------------------------------------------------------------------------

/**
 * Every test above reaches a preset's factory directly — `svg().modules[...]` — which
 * proves the mock's shape but never that importing the package reaches it. The link
 * between the two is AUTO_DETECT_PRESETS, and for a package that is NOT installed
 * here, nothing else observes that link: misspelling the key for react-native-svg,
 * react-native-mmkv or async-storage silently stops the preset applying and passes
 * both the mock and the native suites. (For installed packages the native suite
 * renders through the real import and does catch it.)
 *
 * Rather than add six dependencies to close that, assert the invariant that the
 * defect violates: a package name in the map must be one the named preset actually
 * declares. This covers every entry, including ones added later.
 */
describe("preset auto-detect map", () => {
  const presets = { ...Presets } as Record<string, () => { modules: Record<string, unknown> }>;

  it("names a real preset factory for every package", () => {
    for (const [pkg, presetName] of Object.entries(AUTO_DETECT_PRESETS)) {
      expect(typeof presets[presetName], `${pkg} -> ${presetName}`).toBe("function");
    }
  });

  it("maps each package to a preset that declares a module for it", () => {
    const unwired: string[] = [];
    for (const [pkg, presetName] of Object.entries(AUTO_DETECT_PRESETS)) {
      const modules = presets[presetName]().modules;
      if (!Object.prototype.hasOwnProperty.call(modules, pkg)) {
        unwired.push(`${pkg} -> ${presetName}() declares [${Object.keys(modules).join(", ")}]`);
      }
    }
    expect(unwired).toEqual([]);
  });

  // PRESET_MODULES is what `migrate` and `doctor` print when they say what a preset
  // covers ("the expo preset shadows expo-constants, expo-font, …"). The CLI cannot
  // import the presets to ask, so the list is written out — and this compares it with
  // every factory, both ways, so a printed claim cannot outlive the preset it names.
  it("PRESET_MODULES lists exactly the modules every preset declares", () => {
    const declared = Object.fromEntries(
      Object.keys(presets).map((name) => [name, Object.keys(presets[name]().modules).sort()]),
    );
    const listed = Object.fromEntries(
      Object.entries(PRESET_MODULES).map(([name, modules]) => [name, [...modules].sort()]),
    );
    expect(listed).toEqual(declared);
  });
});
