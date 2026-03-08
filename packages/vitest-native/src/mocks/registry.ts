// Components
import { createViewMock } from "./components/View.js";
import { createTextMock } from "./components/Text.js";
import { createImageMock } from "./components/Image.js";
import { createTextInputMock } from "./components/TextInput.js";
import { createScrollViewMock } from "./components/ScrollView.js";
import { createFlatListMock } from "./components/FlatList.js";
import { createSectionListMock } from "./components/SectionList.js";
import { createModalMock } from "./components/Modal.js";
import { createPressableMock } from "./components/Pressable.js";
import { createTouchableOpacityMock } from "./components/TouchableOpacity.js";
import { createTouchableHighlightMock } from "./components/TouchableHighlight.js";
import { createTouchableWithoutFeedbackMock } from "./components/TouchableWithoutFeedback.js";
import { createTouchableNativeFeedbackMock } from "./components/TouchableNativeFeedback.js";
import { createActivityIndicatorMock } from "./components/ActivityIndicator.js";
import { createButtonMock } from "./components/Button.js";
import { createSwitchMock } from "./components/Switch.js";
import { createRefreshControlMock } from "./components/RefreshControl.js";
import { createStatusBarMock } from "./components/StatusBar.js";
import { createSafeAreaViewMock } from "./components/SafeAreaView.js";
import { createKeyboardAvoidingViewMock } from "./components/KeyboardAvoidingView.js";
import { createImageBackgroundMock } from "./components/ImageBackground.js";
import { createVirtualizedListMock } from "./components/VirtualizedList.js";
import { createInputAccessoryViewMock } from "./components/InputAccessoryView.js";
import { createDrawerLayoutAndroidMock } from "./components/DrawerLayoutAndroid.js";

// APIs
import { createPlatformMock } from "./apis/Platform.js";
import { createDimensionsMock } from "./apis/Dimensions.js";
import { createStyleSheetMock } from "./apis/StyleSheet.js";
import { createAnimatedMock } from "./apis/Animated.js";
import { createAlertMock } from "./apis/Alert.js";
import { createLinkingMock } from "./apis/Linking.js";
import { createAppStateMock } from "./apis/AppState.js";
import { createKeyboardMock } from "./apis/Keyboard.js";
import { createBackHandlerMock } from "./apis/BackHandler.js";
import { createVibrationMock } from "./apis/Vibration.js";
import { createPermissionsAndroidMock } from "./apis/PermissionsAndroid.js";
import { createAppearanceMock } from "./apis/Appearance.js";
import { createPixelRatioMock } from "./apis/PixelRatio.js";
import { createLayoutAnimationMock } from "./apis/LayoutAnimation.js";
import { createClipboardMock } from "./apis/Clipboard.js";
import { createShareMock } from "./apis/Share.js";
import { createAccessibilityInfoMock } from "./apis/AccessibilityInfo.js";
import { createInteractionManagerMock } from "./apis/InteractionManager.js";
import { createPanResponderMock } from "./apis/PanResponder.js";
import { createToastAndroidMock } from "./apis/ToastAndroid.js";
import { createActionSheetIOSMock } from "./apis/ActionSheetIOS.js";
import { createLogBoxMock } from "./apis/LogBox.js";
import { createEasingMock } from "./apis/Easing.js";
import { createI18nManagerMock } from "./apis/I18nManager.js";
import { createDeviceEventEmitterMock } from "./apis/DeviceEventEmitter.js";
import { createUseColorSchemeMock } from "./apis/useColorScheme.js";
import { createUseWindowDimensionsMock } from "./apis/useWindowDimensions.js";

// Native
import { createNativeModulesMock } from "./native/NativeModules.js";
import { createTurboModuleRegistryMock } from "./native/TurboModuleRegistry.js";
import { createUIManagerMock } from "./native/UIManager.js";
import { createNativeEventEmitterMock } from "./native/NativeEventEmitter.js";
import { createNativeComponentRegistryMock } from "./native/NativeComponentRegistry.js";
import { createRequireNativeComponentMock } from "./native/requireNativeComponent.js";

// Inline lightweight mocks (not worth separate files)
import { vi } from "vitest";
import React from "react";

function createAppRegistryMock() {
  return {
    registerComponent: vi.fn(),
    registerRunnable: vi.fn(),
    registerSection: vi.fn(),
    getAppKeys: vi.fn(() => []),
    unmountApplicationComponentAtRootTag: vi.fn(),
    runApplication: vi.fn(),
    setSurfaceProps: vi.fn(),
    registerHeadlessTask: vi.fn(),
    registerCancellableHeadlessTask: vi.fn(),
    startHeadlessTask: vi.fn(),
    cancelHeadlessTask: vi.fn(),
  };
}

function createProcessColorMock() {
  // Basic named colors → ARGB integers (matches RN's processColor-test.js)
  const namedColors: Record<string, number> = {
    red: 0xffff0000,
    green: 0xff008000,
    blue: 0xff0000ff,
    white: 0xffffffff,
    black: 0xff000000,
    transparent: 0x00000000,
    yellow: 0xffffff00,
    cyan: 0xff00ffff,
    magenta: 0xffff00ff,
    orange: 0xffffa500,
    purple: 0xff800080,
    gray: 0xff808080,
    grey: 0xff808080,
  };

  return vi.fn((color: any): number | null => {
    if (color == null) return null;
    if (typeof color === "number") return color;
    if (typeof color === "string") {
      const lower = color.toLowerCase().trim();
      if (namedColors[lower] != null) return namedColors[lower];

      // #RRGGBB → 0xFFRRGGBB
      const hex6 = lower.match(/^#([0-9a-f]{6})$/);
      if (hex6) return (0xff000000 + parseInt(hex6[1], 16)) >>> 0;

      // #RGB → expand to #RRGGBB
      const hex3 = lower.match(/^#([0-9a-f]{3})$/);
      if (hex3) {
        const [r, g, b] = hex3[1].split("");
        return (0xff000000 + parseInt(`${r}${r}${g}${g}${b}${b}`, 16)) >>> 0;
      }

      // #RRGGBBAA → 0xAARRGGBB
      const hex8 = lower.match(/^#([0-9a-f]{8})$/);
      if (hex8) {
        const rgb = parseInt(hex8[1].slice(0, 6), 16);
        const alpha = parseInt(hex8[1].slice(6, 8), 16);
        return ((alpha << 24) + rgb) >>> 0;
      }

      // rgb(r, g, b) → 0xFFRRGGBB
      const rgbMatch = lower.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        return ((0xff << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b)) >>> 0;
      }

      // rgba(r, g, b, a) → 0xAARRGGBB
      const rgbaMatch = lower.match(
        /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/,
      );
      if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        const alpha = Math.round(parseFloat(a) * 255);
        return ((alpha << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b)) >>> 0;
      }
    }
    return 0xff000000; // opaque black fallback
  });
}

function createFindNodeHandleMock() {
  return vi.fn((_componentOrHandle: any) => null);
}

function createPlatformColorMock() {
  return vi.fn((..._names: string[]) => "PlatformColor");
}

function createDynamicColorIOSMock() {
  return vi.fn((_config: { dark: string; light: string }) => "DynamicColorIOS");
}

function createSettingsMock() {
  const settings: Record<string, any> = {};
  return {
    get: vi.fn((key: string) => settings[key]),
    set: vi.fn((obj: Record<string, any>) => Object.assign(settings, obj)),
    watchKeys: vi.fn(() => 0),
    clearWatch: vi.fn(),
  };
}

function createDeviceInfoMock() {
  return {
    getConstants: vi.fn(() => ({
      Dimensions: {
        window: { width: 390, height: 844, scale: 3, fontScale: 1 },
        screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
      },
    })),
  };
}

function createVirtualizedSectionListMock() {
  const VirtualizedSectionList = React.forwardRef((props: any, ref: any) => {
    const { sections, renderItem, renderSectionHeader, keyExtractor, ...rest } = props;
    const children: any[] = [];
    if (sections) {
      sections.forEach((section: any, sectionIndex: number) => {
        if (renderSectionHeader) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `h-${sectionIndex}` },
              renderSectionHeader({ section }),
            ),
          );
        }
        if (section.data) {
          section.data.forEach((item: any, index: number) => {
            const key = keyExtractor ? keyExtractor(item, index) : `${sectionIndex}-${index}`;
            children.push(
              React.createElement(
                React.Fragment,
                { key },
                renderItem({ item, index, section, separators: {} }),
              ),
            );
          });
        }
      });
    }
    return React.createElement("VirtualizedSectionList", { ...rest, ref }, ...children);
  });
  VirtualizedSectionList.displayName = "VirtualizedSectionList";
  return VirtualizedSectionList;
}

function createTouchableMock() {
  return {
    Mixin: {},
    TOUCH_TARGET_DEBUG: false,
    renderDebugView: vi.fn(() => null),
  };
}

function createUseAnimatedValueMock() {
  return vi.fn((initialValue: number) => {
    const AnimatedMod = createAnimatedMock();
    return new AnimatedMod.Value(initialValue);
  });
}

// Re-export all factories
export {
  // Components
  createViewMock,
  createTextMock,
  createImageMock,
  createTextInputMock,
  createScrollViewMock,
  createFlatListMock,
  createSectionListMock,
  createModalMock,
  createPressableMock,
  createTouchableOpacityMock,
  createTouchableHighlightMock,
  createTouchableWithoutFeedbackMock,
  createTouchableNativeFeedbackMock,
  createActivityIndicatorMock,
  createButtonMock,
  createSwitchMock,
  createRefreshControlMock,
  createStatusBarMock,
  createSafeAreaViewMock,
  createKeyboardAvoidingViewMock,
  createImageBackgroundMock,
  createVirtualizedListMock,
  createInputAccessoryViewMock,
  createDrawerLayoutAndroidMock,
  // APIs
  createPlatformMock,
  createDimensionsMock,
  createStyleSheetMock,
  createAnimatedMock,
  createAlertMock,
  createLinkingMock,
  createAppStateMock,
  createKeyboardMock,
  createBackHandlerMock,
  createVibrationMock,
  createPermissionsAndroidMock,
  createAppearanceMock,
  createPixelRatioMock,
  createLayoutAnimationMock,
  createClipboardMock,
  createShareMock,
  createAccessibilityInfoMock,
  createInteractionManagerMock,
  createPanResponderMock,
  createToastAndroidMock,
  createActionSheetIOSMock,
  createLogBoxMock,
  createEasingMock,
  createI18nManagerMock,
  createDeviceEventEmitterMock,
  createUseColorSchemeMock,
  createUseWindowDimensionsMock,
  // Native
  createNativeModulesMock,
  createTurboModuleRegistryMock,
  createUIManagerMock,
  createNativeEventEmitterMock,
  createNativeComponentRegistryMock,
  createRequireNativeComponentMock,
};

export function buildReactNativeMock(platform: "ios" | "android" = "ios") {
  const mock: Record<string, any> = {
    // Components
    View: createViewMock(),
    Text: createTextMock(),
    Image: createImageMock(),
    TextInput: createTextInputMock(),
    ScrollView: createScrollViewMock(),
    FlatList: createFlatListMock(),
    SectionList: createSectionListMock(),
    Modal: createModalMock(),
    Pressable: createPressableMock(),
    TouchableOpacity: createTouchableOpacityMock(),
    TouchableHighlight: createTouchableHighlightMock(),
    TouchableWithoutFeedback: createTouchableWithoutFeedbackMock(),
    TouchableNativeFeedback: createTouchableNativeFeedbackMock(),
    ActivityIndicator: createActivityIndicatorMock(),
    Button: createButtonMock(),
    Switch: createSwitchMock(),
    RefreshControl: createRefreshControlMock(),
    StatusBar: createStatusBarMock(),
    SafeAreaView: createSafeAreaViewMock(),
    KeyboardAvoidingView: createKeyboardAvoidingViewMock(),
    ImageBackground: createImageBackgroundMock(),
    VirtualizedList: createVirtualizedListMock(),
    InputAccessoryView: createInputAccessoryViewMock(),
    DrawerLayoutAndroid: createDrawerLayoutAndroidMock(),

    // APIs
    Platform: createPlatformMock(platform),
    Dimensions: createDimensionsMock(),
    StyleSheet: createStyleSheetMock(),
    Animated: createAnimatedMock(),
    Alert: createAlertMock(),
    Linking: createLinkingMock(),
    AppState: createAppStateMock(),
    Keyboard: createKeyboardMock(),
    BackHandler: createBackHandlerMock(),
    Vibration: createVibrationMock(),
    PermissionsAndroid: createPermissionsAndroidMock(),
    Appearance: createAppearanceMock(),
    PixelRatio: undefined as any, // set below after Dimensions is available
    LayoutAnimation: createLayoutAnimationMock(),
    Clipboard: createClipboardMock(),
    Share: createShareMock(),
    AccessibilityInfo: createAccessibilityInfoMock(),
    InteractionManager: createInteractionManagerMock(),
    PanResponder: createPanResponderMock(),
    ToastAndroid: createToastAndroidMock(),
    ActionSheetIOS: createActionSheetIOSMock(),
    LogBox: createLogBoxMock(),
    Easing: createEasingMock(),
    I18nManager: createI18nManagerMock(),
    DeviceEventEmitter: createDeviceEventEmitterMock(),
    useColorScheme: createUseColorSchemeMock(),
    useWindowDimensions: createUseWindowDimensionsMock(),

    // Native
    NativeModules: createNativeModulesMock(),
    TurboModuleRegistry: createTurboModuleRegistryMock(),
    UIManager: createUIManagerMock(),
    NativeEventEmitter: createNativeEventEmitterMock(),
    NativeAppEventEmitter: createDeviceEventEmitterMock(),
    NativeComponentRegistry: createNativeComponentRegistryMock(),
    requireNativeComponent: createRequireNativeComponentMock(),

    // Additional RN exports
    AppRegistry: createAppRegistryMock(),
    VirtualizedSectionList: createVirtualizedSectionListMock(),
    Touchable: createTouchableMock(),
    processColor: createProcessColorMock(),
    findNodeHandle: createFindNodeHandleMock(),
    PlatformColor: createPlatformColorMock(),
    DynamicColorIOS: createDynamicColorIOSMock(),
    Settings: createSettingsMock(),
    DeviceInfo: createDeviceInfoMock(),
    useAnimatedValue: createUseAnimatedValueMock(),
    RootTagContext: React.createContext(null as any),
    ReactNativeVersion: { major: 0, minor: 76, patch: 0 },
    Systrace: {
      beginEvent: vi.fn(),
      endEvent: vi.fn(),
      beginAsyncEvent: vi.fn(() => 0),
      endAsyncEvent: vi.fn(),
      counterEvent: vi.fn(),
      isEnabled: vi.fn(() => false),
    },
    DevSettings: {
      addMenuItem: vi.fn(),
      reload: vi.fn(),
    },
    Networking: {
      addListener: vi.fn(),
      removeListeners: vi.fn(),
    },
    unstable_batchedUpdates: vi.fn((fn: Function) => fn()),
    registerCallableModule: vi.fn(),
    codegenNativeCommands: vi.fn(() => ({})),
    codegenNativeComponent: vi.fn((name: string) => name),
    UTFSequence: { BOM: "\ufeff", BULLET: "\u2022", MIDDOT: "\u00b7", NBSP: "\u00a0" },

    // Deprecated but still exported (community packages)
    ProgressBarAndroid: (() => {
      const C = React.forwardRef((props: any, ref: any) =>
        React.createElement("ProgressBarAndroid", { ...props, ref }),
      );
      C.displayName = "ProgressBarAndroid";
      return C;
    })(),
    PushNotificationIOS: {
      presentLocalNotification: vi.fn(),
      scheduleLocalNotification: vi.fn(),
      cancelAllLocalNotifications: vi.fn(),
      removeAllDeliveredNotifications: vi.fn(),
      getDeliveredNotifications: vi.fn(async () => []),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
      requestPermissions: vi.fn(async () => ({ alert: true, badge: true, sound: true })),
      getInitialNotification: vi.fn(async () => null),
    },

    // Low-level / internal but importable
    NativeDialogManagerAndroid: {
      showAlert: vi.fn(),
    },
    usePressability: vi.fn(() => ({})),

    // Default export for CJS compat
    default: undefined as any,
  };

  // Wire PixelRatio to read from Dimensions dynamically
  mock.PixelRatio = createPixelRatioMock(() => mock.Dimensions.get("window"));

  // Wire Appearance.setColorScheme → useColorScheme so dark mode propagates
  const origSetColorScheme = mock.Appearance.setColorScheme;
  mock.Appearance.setColorScheme = vi.fn((scheme: "light" | "dark") => {
    origSetColorScheme(scheme);
    mock.useColorScheme._setScheme(scheme);
  });

  // Wire Dimensions.set → useWindowDimensions so responsive layouts propagate
  const origDimensionsSet = mock.Dimensions.set;
  mock.Dimensions.set = vi.fn((dims: any) => {
    origDimensionsSet(dims);
    if (dims.window) {
      mock.useWindowDimensions._setDimensions(dims.window);
    }
  });

  // Set default to self for `import RN from 'react-native'` compat
  mock.default = mock;

  return mock;
}
