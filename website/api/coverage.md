# API Coverage

vitest-native's mock engine covers **every stable React Native public export** — 85/85 stable exports as of RN 0.86, with 14 unstable/experimental internals intentionally skipped (see [Not covered](#not-covered)). Parity isn't a one-time claim: a CI-gated `check-compat` script resolves the exact installed RN package, diffs its runtime export list against the mock weekly, and opens a tracking issue on any gap. The native engine runs real React Native, so coverage there is simply *all of RN*.

## Components (27)

`View`, `Text`, `TextInput`, `Image`, `ScrollView`, `FlatList`, `SectionList`, `VirtualizedList`, `VirtualizedSectionList`, `Modal`, `Pressable`, `Touchable`, `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`, `TouchableNativeFeedback`, `ActivityIndicator`, `Button`, `Switch`, `RefreshControl`, `StatusBar`, `SafeAreaView`, `KeyboardAvoidingView`, `ImageBackground`, `InputAccessoryView`, `DrawerLayoutAndroid`, `ProgressBarAndroid`

**Component instance methods** are supported via refs: `TextInput` (`focus`, `blur`, `clear`, `isFocused`), `ScrollView` (`scrollTo`, `scrollToEnd`), `FlatList` (`scrollToIndex`, `scrollToOffset`, `scrollToEnd`, `recordInteraction`), `SectionList` (`scrollToIndex`, `scrollToLocation`, `scrollToEnd`, `recordInteraction`).

## APIs (30)

`Platform`, `StyleSheet`, `Dimensions`, `Animated`, `Alert`, `Linking`, `Keyboard`, `AppState`, `BackHandler`, `Vibration`, `PermissionsAndroid`, `Appearance`, `PixelRatio`, `LayoutAnimation`, `Share`, `AccessibilityInfo`, `InteractionManager`, `PanResponder`, `ToastAndroid`, `ActionSheetIOS`, `LogBox`, `Easing`, `I18nManager`, `DeviceEventEmitter`, `Clipboard`, `AppRegistry`, `Settings`, `DevSettings`, `Systrace`, `PushNotificationIOS`

### Animated

Full animation API including `timing`, `spring`, `decay`, `sequence`, `parallel`, `stagger`, `loop`, `delay`, `event`, and arithmetic operators (`add`, `subtract`, `multiply`, `divide`, `modulo`, `diffClamp`). `Animated.View`, `Animated.Text`, `Animated.Image`, `Animated.ScrollView` are real React components (not string literals) compatible with RNTL.

## Hooks (3)

`useColorScheme`, `useWindowDimensions`, `useAnimatedValue`

## Native internals (8)

`NativeModules`, `TurboModuleRegistry`, `UIManager`, `NativeEventEmitter`, `NativeAppEventEmitter`, `NativeComponentRegistry`, `NativeDialogManagerAndroid`, `requireNativeComponent`

## Utilities (11)

`processColor`, `findNodeHandle`, `PlatformColor`, `DynamicColorIOS`, `RootTagContext`, `ReactNativeVersion`, `UTFSequence`, `codegenNativeCommands`, `codegenNativeComponent`, `registerCallableModule`, `unstable_batchedUpdates`

## Not covered

The following **unstable / experimental / private** exports are intentionally not mocked. These are React Native internals not intended for use in application code:

| Export | Reason |
|--------|--------|
| `DevMenu` | Private dev tooling, not used in production code |
| `experimental_LayoutConformance` | Experimental API, subject to change without notice |
| `unstable_NativeText` | Internal renderer primitive |
| `unstable_NativeView` | Internal renderer primitive |
| `unstable_TextAncestorContext` | Internal context for Text nesting detection |
| `unstable_VirtualView` | Private experimental component |
| `VirtualViewMode` | Private experimental enum |

If your code imports any of these, provide a custom mock via the [`mocks` option](/guide/plugin-options#mocks):

```ts
reactNative({
  mocks: {
    unstable_NativeText: MyCustomMock,
  },
})
```
