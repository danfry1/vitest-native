/**
 * Behavioral tests for all built-in presets.
 * Verifies that each preset's factory produces mocks with correct shapes,
 * callable methods, and expected return values — not just that they exist.
 */
import { describe, it, expect } from "vitest";
import {
  reanimated,
  gestureHandler,
  safeAreaContext,
  navigation,
  asyncStorage,
  screens,
  expo,
} from "../src/presets/index.js";

// --- Navigation ---

describe("preset: navigation", () => {
  const preset = navigation();
  const mock = preset.modules["@react-navigation/native"].factory();

  it("useNavigation returns an object with navigate, goBack, reset", () => {
    const nav = mock.useNavigation();
    expect(typeof nav.navigate).toBe("function");
    expect(typeof nav.goBack).toBe("function");
    expect(typeof nav.reset).toBe("function");
    expect(typeof nav.setParams).toBe("function");
    expect(typeof nav.dispatch).toBe("function");
    expect(typeof nav.removeListener).toBe("function");
    expect(typeof nav.getId).toBe("function");
  });

  it("navigate is callable as a mock", () => {
    const nav = mock.useNavigation();
    nav.navigate("Home", { id: 1 });
    expect(nav.navigate).toHaveBeenCalledWith("Home", { id: 1 });
  });

  it("useRoute returns route shape", () => {
    const route = mock.useRoute();
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

  describe("@react-navigation/native-stack", () => {
    const stackMock = preset.modules["@react-navigation/native-stack"].factory();

    it("createNativeStackNavigator returns Navigator, Screen, Group", () => {
      const stack = stackMock.createNativeStackNavigator();
      expect(stack.Navigator).toBeDefined();
      expect(stack.Screen).toBeDefined();
      expect(stack.Group).toBeDefined();
    });
  });

  describe("@react-navigation/bottom-tabs", () => {
    const tabsMock = preset.modules["@react-navigation/bottom-tabs"].factory();

    it("createBottomTabNavigator returns Navigator, Screen, Group", () => {
      const tabs = tabsMock.createBottomTabNavigator();
      expect(tabs.Navigator).toBeDefined();
      expect(tabs.Screen).toBeDefined();
      expect(tabs.Group).toBeDefined();
    });
  });

  describe("@react-navigation/elements", () => {
    const elementsMock = preset.modules["@react-navigation/elements"].factory();

    it("Header components are renderable", () => {
      expect(elementsMock.Header.displayName).toBe("Header");
      expect(elementsMock.HeaderBackground.displayName).toBe("HeaderBackground");
      expect(elementsMock.HeaderBackButton.displayName).toBe("HeaderBackButton");
      expect(elementsMock.HeaderTitle.displayName).toBe("HeaderTitle");
    });

    it("useHeaderHeight returns a number", () => {
      expect(elementsMock.useHeaderHeight()).toBe(64);
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
  const mock = preset.modules["react-native-reanimated"].factory();

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

  it("SharedValue.modify mutates in place", () => {
    const sv = mock.useDerivedValue(() => ({ x: 1 }));
    sv.modify((obj: any) => {
      obj.x = 5;
    });
    expect(sv.value.x).toBe(5);
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

  it("Extrapolation has expected constants", () => {
    expect(mock.Extrapolation.CLAMP).toBe("clamp");
    expect(mock.Extrapolation.EXTEND).toBe("extend");
  });
});

// --- Gesture Handler ---

describe("preset: gestureHandler", () => {
  const preset = gestureHandler();
  const mock = preset.modules["react-native-gesture-handler"].factory();

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
});

// --- Safe Area Context ---

describe("preset: safeAreaContext", () => {
  const preset = safeAreaContext();
  const mock = preset.modules["react-native-safe-area-context"].factory();

  it("useSafeAreaInsets returns realistic insets", () => {
    const insets = mock.useSafeAreaInsets();
    expect(insets).toHaveProperty("top");
    expect(insets).toHaveProperty("bottom");
    expect(insets).toHaveProperty("left");
    expect(insets).toHaveProperty("right");
    expect(insets.top).toBeGreaterThan(0); // iPhone notch
    expect(insets.bottom).toBeGreaterThan(0); // Home indicator
  });

  it("useSafeAreaFrame returns realistic frame", () => {
    const frame = mock.useSafeAreaFrame();
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
});

// --- Async Storage ---

describe("preset: asyncStorage", () => {
  const preset = asyncStorage();
  const mock = preset.modules["@react-native-async-storage/async-storage"].factory();

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
});

// --- Screens ---

describe("preset: screens", () => {
  const preset = screens();
  const mock = preset.modules["react-native-screens"].factory();

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
    const mock = preset.modules["expo-constants"].factory();

    it("has expoConfig with app metadata", () => {
      expect(mock.expoConfig).toBeDefined();
      expect(mock.expoConfig.name).toBe("test-app");
      expect(mock.expoConfig.slug).toBe("test-app");
      expect(mock.expoConfig.version).toBe("1.0.0");
    });

    it("isDevice is true", () => {
      expect(mock.isDevice).toBe(true);
    });

    it("getWebViewUserAgentAsync resolves", async () => {
      const result = await mock.getWebViewUserAgentAsync();
      expect(typeof result).toBe("string");
    });
  });

  describe("expo-font", () => {
    const preset = expo();
    const mock = preset.modules["expo-font"].factory();

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
    const mock = preset.modules["expo-asset"].factory();

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
    const mock = preset.modules["expo-splash-screen"].factory();

    it("preventAutoHideAsync resolves", async () => {
      await expect(mock.preventAutoHideAsync()).resolves.toBe(true);
    });

    it("hideAsync resolves", async () => {
      await expect(mock.hideAsync()).resolves.toBe(true);
    });
  });

  describe("expo-linking", () => {
    const preset = expo();
    const mock = preset.modules["expo-linking"].factory();

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
  });

  describe("expo-status-bar", () => {
    const preset = expo();
    const mock = preset.modules["expo-status-bar"].factory();

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
