/**
 * Component conformance tests — ported from React Native's own test suite.
 *
 * Verifies that our component mocks match the behavioral contracts tested
 * in facebook/react-native's component tests.
 *
 * Sources:
 * - Libraries/Components/__tests__/Button-test.js
 * - Libraries/Components/Pressable/__tests__/Pressable-test.js
 * - Libraries/Components/View/__tests__/View-test.js
 * - Libraries/Text/__tests__/Text-test.js
 * - Libraries/Components/TextInput/__tests__/TextInput-test.js
 * - Libraries/Components/ScrollView/__tests__/ScrollView-test.js
 * - Libraries/Modal/__tests__/Modal-test.js
 * - Libraries/Image/__tests__/Image-test.js
 * - Libraries/Lists/__tests__/FlatList-test.js
 * - Libraries/Components/StatusBar/__tests__/StatusBar-test.js
 */

import { describe, it, expect, vi } from "vitest";
import React, { createRef } from "react";
import { render, screen } from "@testing-library/react-native";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  FlatList,
  Modal,
  Button,
  StatusBar,
  LogBox,
  AppState,
  Keyboard,
  Linking,
  Share,
  Alert,
  Vibration,
  BackHandler,
  Appearance,
  I18nManager,
  AccessibilityInfo,
  InteractionManager,
  PanResponder,
  NativeModules,
  NativeEventEmitter,
  AppRegistry,
} from "react-native";

// ---------------------------------------------------------------------------
// Pressable — ported from Pressable-test.js
// ---------------------------------------------------------------------------

describe("Pressable (conformance)", () => {
  it("renders with accessible={true} by default", () => {
    render(<Pressable testID="p"><Text>Hi</Text></Pressable>);
    expect(screen.getByTestId("p").props.accessible).toBe(true);
  });

  it("disabled translates to accessibilityState.disabled", () => {
    render(<Pressable testID="p" disabled><Text>Hi</Text></Pressable>);
    expect(screen.getByTestId("p").props.accessibilityState).toEqual({ disabled: true });
  });

  it("disabled merges with existing accessibilityState", () => {
    render(
      <Pressable testID="p" disabled accessibilityState={{ checked: true }}>
        <Text>Hi</Text>
      </Pressable>,
    );
    const state = screen.getByTestId("p").props.accessibilityState;
    expect(state.disabled).toBe(true);
    expect(state.checked).toBe(true);
  });

  it("passes accessibilityState through when not disabled", () => {
    render(
      <Pressable testID="p" accessibilityState={{ checked: true }}>
        <Text>Hi</Text>
      </Pressable>,
    );
    expect(screen.getByTestId("p").props.accessibilityState).toEqual({ checked: true });
  });
});

// ---------------------------------------------------------------------------
// Button — ported from Button-test.js
// ---------------------------------------------------------------------------

describe("Button (conformance)", () => {
  it("renders with accessible={true}", () => {
    render(<Button testID="b" title="OK" onPress={() => {}} />);
    expect(screen.getByTestId("b").props.accessible).toBe(true);
  });

  it("renders title as accessibilityLabel", () => {
    render(<Button testID="b" title="Submit" onPress={() => {}} />);
    expect(screen.getByTestId("b").props.accessibilityLabel).toBe("Submit");
  });

  it("renders accessibilityRole=button", () => {
    render(<Button testID="b" title="OK" onPress={() => {}} />);
    expect(screen.getByTestId("b").props.accessibilityRole).toBe("button");
  });

  it("disabled sets accessibilityState.disabled", () => {
    render(<Button testID="b" title="OK" onPress={() => {}} disabled />);
    expect(screen.getByTestId("b").props.accessibilityState).toEqual({ disabled: true });
  });

  it("visible={false} Modal hides Button", () => {
    render(
      <Modal visible={false}>
        <Button testID="b" title="OK" onPress={() => {}} />
      </Modal>,
    );
    expect(screen.queryByTestId("b")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Modal — ported from Modal-test.js
// ---------------------------------------------------------------------------

describe("Modal (conformance)", () => {
  it("renders children when visible", () => {
    render(
      <Modal visible={true}>
        <View testID="inside" />
      </Modal>,
    );
    expect(screen.getByTestId("inside")).toBeTruthy();
  });

  it("returns null when visible={false}", () => {
    render(
      <Modal visible={false}>
        <View testID="inside" />
      </Modal>,
    );
    expect(screen.queryByTestId("inside")).toBeNull();
  });

  it("defaults to visible={true}", () => {
    render(
      <Modal>
        <View testID="inside" />
      </Modal>,
    );
    expect(screen.getByTestId("inside")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TextInput — ported from TextInput-test.js
// ---------------------------------------------------------------------------

describe("TextInput (conformance)", () => {
  it("exposes focus, blur, clear, isFocused as functions", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(typeof ref.current.focus).toBe("function");
    expect(typeof ref.current.blur).toBe("function");
    expect(typeof ref.current.clear).toBe("function");
    expect(typeof ref.current.isFocused).toBe("function");
  });

  it("isFocused returns a boolean", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(typeof ref.current.isFocused()).toBe("boolean");
  });

  it("setNativeProps is available", () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} />);
    expect(typeof ref.current.setNativeProps).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// ScrollView — ported from ScrollView-test.js
// ---------------------------------------------------------------------------

describe("ScrollView (conformance)", () => {
  it("exposes scrollTo as a function", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(typeof ref.current.scrollTo).toBe("function");
  });

  it("exposes scrollToEnd as a function", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(typeof ref.current.scrollToEnd).toBe("function");
  });

  it("exposes flashScrollIndicators", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(typeof ref.current.flashScrollIndicators).toBe("function");
  });

  it("exposes getScrollResponder", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(typeof ref.current.getScrollResponder).toBe("function");
  });

  it("exposes getInnerViewNode", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(typeof ref.current.getInnerViewNode).toBe("function");
  });

  it("exposes setNativeProps", () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} />);
    expect(typeof ref.current.setNativeProps).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Image — ported from Image-test.js
// ---------------------------------------------------------------------------

describe("Image (conformance)", () => {
  it("has static getSize", () => {
    expect(typeof Image.getSize).toBe("function");
  });

  it("has static getSizeWithHeaders", () => {
    expect(typeof Image.getSizeWithHeaders).toBe("function");
  });

  it("has static prefetch", () => {
    expect(typeof Image.prefetch).toBe("function");
  });

  it("has static queryCache", () => {
    expect(typeof Image.queryCache).toBe("function");
  });

  it("has static resolveAssetSource", () => {
    expect(typeof Image.resolveAssetSource).toBe("function");
  });

  it("resolveAssetSource returns source for objects", () => {
    const source = { uri: "https://example.com/img.png" };
    expect(Image.resolveAssetSource(source)).toEqual(source);
  });

  it("resolveAssetSource returns asset object for numbers", () => {
    const resolved = Image.resolveAssetSource(42);
    expect(resolved).toHaveProperty("uri");
    expect(resolved).toHaveProperty("width");
    expect(resolved).toHaveProperty("height");
  });

  it("getSize calls success callback", async () => {
    const success = vi.fn();
    Image.getSize("https://example.com/img.png", success);
    await new Promise((r) => setTimeout(r, 10));
    expect(success).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
  });

  it("prefetch returns a promise", () => {
    const result = Image.prefetch("https://example.com/img.png");
    expect(result).toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// FlatList — ported from FlatList-test.js
// ---------------------------------------------------------------------------

describe("FlatList (conformance)", () => {
  it("renders all items", () => {
    const data = [{ key: "a" }, { key: "b" }, { key: "c" }];
    const renderItem = vi.fn(({ item }: any) =>
      React.createElement(Text, null, item.key),
    );
    render(
      <FlatList data={data} renderItem={renderItem} />,
    );
    expect(renderItem).toHaveBeenCalledTimes(3);
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.getByText("c")).toBeTruthy();
  });

  it("renders ListEmptyComponent for empty data", () => {
    render(
      <FlatList
        data={[]}
        renderItem={() => null}
        ListEmptyComponent={<Text>Empty</Text>}
      />,
    );
    expect(screen.getByText("Empty")).toBeTruthy();
  });

  it("renders ListHeaderComponent", () => {
    render(
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={<Text>Header</Text>}
        ListEmptyComponent={<Text>Empty</Text>}
      />,
    );
    expect(screen.getByText("Header")).toBeTruthy();
  });

  it("renders ListFooterComponent", () => {
    render(
      <FlatList
        data={[]}
        renderItem={() => null}
        ListFooterComponent={<Text>Footer</Text>}
        ListEmptyComponent={<Text>Empty</Text>}
      />,
    );
    expect(screen.getByText("Footer")).toBeTruthy();
  });

  it("uses keyExtractor", () => {
    const keyExtractor = vi.fn((item: any) => item.id);
    const data = [{ id: "x" }, { id: "y" }];
    render(
      <FlatList
        data={data}
        renderItem={({ item }: any) => <Text>{item.id}</Text>}
        keyExtractor={keyExtractor}
      />,
    );
    expect(keyExtractor).toHaveBeenCalledTimes(2);
    expect(keyExtractor).toHaveBeenCalledWith({ id: "x" }, 0);
    expect(keyExtractor).toHaveBeenCalledWith({ id: "y" }, 1);
  });

  it("exposes ref methods", () => {
    const ref = createRef<any>();
    render(
      <FlatList ref={ref} data={[]} renderItem={() => null} />,
    );
    expect(typeof ref.current.scrollToEnd).toBe("function");
    expect(typeof ref.current.scrollToIndex).toBe("function");
    expect(typeof ref.current.scrollToItem).toBe("function");
    expect(typeof ref.current.scrollToOffset).toBe("function");
    expect(typeof ref.current.recordInteraction).toBe("function");
    expect(typeof ref.current.flashScrollIndicators).toBe("function");
    expect(typeof ref.current.setNativeProps).toBe("function");
  });

  it("renders ItemSeparatorComponent between items", () => {
    const data = [{ key: "a" }, { key: "b" }, { key: "c" }];
    render(
      <FlatList
        data={data}
        renderItem={({ item }: any) => <Text>{item.key}</Text>}
        ItemSeparatorComponent={() => <View testID="sep" />}
      />,
    );
    // 3 items → 2 separators
    expect(screen.getAllByTestId("sep")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// StatusBar — static methods
// ---------------------------------------------------------------------------

describe("StatusBar (conformance)", () => {
  it("has setBarStyle", () => {
    expect(typeof StatusBar.setBarStyle).toBe("function");
  });

  it("has setBackgroundColor", () => {
    expect(typeof StatusBar.setBackgroundColor).toBe("function");
  });

  it("has setHidden", () => {
    expect(typeof StatusBar.setHidden).toBe("function");
  });

  it("has pushStackEntry/popStackEntry/replaceStackEntry", () => {
    expect(typeof StatusBar.pushStackEntry).toBe("function");
    expect(typeof StatusBar.popStackEntry).toBe("function");
    expect(typeof StatusBar.replaceStackEntry).toBe("function");
  });

  it("has currentHeight", () => {
    expect(typeof StatusBar.currentHeight).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// API behavioral contracts
// ---------------------------------------------------------------------------

describe("API behavioral contracts", () => {
  describe("LogBox", () => {
    it("has ignoreLogs", () => {
      expect(typeof LogBox.ignoreLogs).toBe("function");
    });

    it("has ignoreAllLogs", () => {
      expect(typeof LogBox.ignoreAllLogs).toBe("function");
    });

    it("ignoreLogs accepts array without throwing", () => {
      expect(() => LogBox.ignoreLogs(["Warning:"])).not.toThrow();
    });

    it("ignoreAllLogs accepts boolean without throwing", () => {
      expect(() => LogBox.ignoreAllLogs(true)).not.toThrow();
    });
  });

  describe("AppState", () => {
    it("has currentState", () => {
      expect(typeof AppState.currentState).toBe("string");
    });

    it("addEventListener returns subscription with remove()", () => {
      const sub = AppState.addEventListener("change", vi.fn());
      expect(typeof sub.remove).toBe("function");
      sub.remove();
    });
  });

  describe("Keyboard", () => {
    it("dismiss is callable", () => {
      expect(() => Keyboard.dismiss()).not.toThrow();
    });

    it("addListener returns subscription", () => {
      const sub = Keyboard.addListener("keyboardDidShow", vi.fn());
      expect(typeof sub.remove).toBe("function");
      sub.remove();
    });
  });

  describe("Linking", () => {
    it("openURL returns promise", () => {
      expect(Linking.openURL("https://example.com")).toBeInstanceOf(Promise);
    });

    it("canOpenURL returns promise", () => {
      expect(Linking.canOpenURL("https://example.com")).toBeInstanceOf(Promise);
    });

    it("getInitialURL returns promise", () => {
      expect(Linking.getInitialURL()).toBeInstanceOf(Promise);
    });
  });

  describe("Share", () => {
    it("share returns promise", () => {
      expect(Share.share({ message: "test" })).toBeInstanceOf(Promise);
    });

    it("has action constants", () => {
      expect(typeof Share.sharedAction).toBe("string");
      expect(typeof Share.dismissedAction).toBe("string");
    });
  });

  describe("Alert", () => {
    it("alert is callable", () => {
      expect(() => Alert.alert("Title", "Message")).not.toThrow();
    });
  });

  describe("Vibration", () => {
    it("vibrate is callable", () => {
      expect(() => Vibration.vibrate()).not.toThrow();
    });

    it("cancel is callable", () => {
      expect(() => Vibration.cancel()).not.toThrow();
    });
  });

  describe("BackHandler", () => {
    it("exitApp is callable", () => {
      expect(() => BackHandler.exitApp()).not.toThrow();
    });

    it("addEventListener returns subscription", () => {
      const sub = BackHandler.addEventListener("hardwareBackPress", vi.fn());
      expect(typeof sub.remove).toBe("function");
      sub.remove();
    });
  });

  describe("Appearance", () => {
    it("getColorScheme returns string or null", () => {
      const scheme = Appearance.getColorScheme();
      expect(["light", "dark", null]).toContain(scheme);
    });

    it("addChangeListener returns subscription", () => {
      const sub = Appearance.addChangeListener(vi.fn());
      expect(typeof sub.remove).toBe("function");
      sub.remove();
    });
  });

  describe("I18nManager", () => {
    it("isRTL is a boolean", () => {
      expect(typeof I18nManager.isRTL).toBe("boolean");
    });
  });

  describe("AccessibilityInfo", () => {
    it("isScreenReaderEnabled returns promise", () => {
      expect(AccessibilityInfo.isScreenReaderEnabled()).toBeInstanceOf(Promise);
    });

    it("addEventListener returns subscription", () => {
      const sub = AccessibilityInfo.addEventListener("screenReaderChanged", vi.fn());
      expect(typeof sub.remove).toBe("function");
      sub.remove();
    });

    it("announceForAccessibility is callable", () => {
      expect(() => AccessibilityInfo.announceForAccessibility("test")).not.toThrow();
    });
  });

  describe("InteractionManager", () => {
    it("runAfterInteractions returns promise with cancel", () => {
      const result = InteractionManager.runAfterInteractions(vi.fn());
      expect(typeof result.then).toBe("function");
      expect(typeof result.cancel).toBe("function");
    });

    it("createInteractionHandle returns number", () => {
      expect(typeof InteractionManager.createInteractionHandle()).toBe("number");
    });
  });

  describe("PanResponder", () => {
    it("create returns panHandlers", () => {
      const responder = PanResponder.create({});
      expect(responder).toHaveProperty("panHandlers");
    });
  });

  describe("NativeModules", () => {
    it("accessing any module returns an object", () => {
      expect(typeof NativeModules.SomeModule).toBe("object");
    });

    it("same module identity is stable", () => {
      expect(NativeModules.Foo).toBe(NativeModules.Foo);
    });

    it("module methods are callable without throwing", () => {
      expect(() => NativeModules.SomeModule.someMethod()).not.toThrow();
    });
  });

  describe("NativeEventEmitter", () => {
    it("can construct with a module", () => {
      expect(() => new NativeEventEmitter(NativeModules.SomeModule)).not.toThrow();
    });

    it("instance has addListener", () => {
      const emitter = new NativeEventEmitter();
      expect(typeof emitter.addListener).toBe("function");
    });
  });

  describe("AppRegistry", () => {
    it("registerComponent is callable", () => {
      expect(() => AppRegistry.registerComponent("App", () => View)).not.toThrow();
    });
  });
});
