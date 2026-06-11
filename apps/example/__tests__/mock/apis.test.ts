import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act as rnAct } from '@testing-library/react-native';
import { resetAllMocks, mockNativeModule, setPlatform, setDimensions, setColorScheme } from 'vitest-native/helpers';
import {
  Platform,
  Dimensions,
  StyleSheet,
  PixelRatio,
  Animated,
  Alert,
  Linking,
  Share,
  Keyboard,
  AppState,
  BackHandler,
  Vibration,
  PermissionsAndroid,
  Appearance,
  LayoutAnimation,
  AccessibilityInfo,
  InteractionManager,
  PanResponder,
  ToastAndroid,
  ActionSheetIOS,
  LogBox,
  Easing,
  I18nManager,
  DeviceEventEmitter,
  Clipboard,
  useColorScheme,
  useWindowDimensions,
  NativeModules,
  TurboModuleRegistry,
  UIManager,
  NativeEventEmitter,
  requireNativeComponent,
  StatusBar,
  processColor,
} from 'react-native';

beforeEach(() => {
  resetAllMocks();
});

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

describe('Platform API', () => {
  it('has OS property', () => expect(Platform.OS).toBe('ios'));
  it('has Version', () => expect(Platform.Version).toBe('17.0'));
  it('has select()', () => expect(Platform.select({ ios: 1, android: 2 })).toBe(1));
  it('has isTesting', () => expect(Platform.isTesting).toBe(true));
  it('has constants', () => expect(Platform.constants.reactNativeVersion).toBeDefined());
});

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

describe('Dimensions API', () => {
  it('get() returns dimensions', () => {
    const dims = Dimensions.get('window');
    expect(dims).toEqual({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });
  it('addEventListener returns subscription', () => {
    const sub = Dimensions.addEventListener('change', vi.fn());
    expect(sub.remove).toBeDefined();
    sub.remove();
  });
  it('set() updates dimensions', () => {
    Dimensions.set({ window: { width: 500, height: 800 } });
    expect(Dimensions.get('window').width).toBe(500);
  });
  it('set() notifies listeners', () => {
    const handler = vi.fn();
    Dimensions.addEventListener('change', handler);
    Dimensions.set({ window: { width: 600, height: 900 }, screen: { width: 600, height: 900 } });
    expect(handler).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

describe('StyleSheet API', () => {
  it('create() returns styles', () => {
    const s = StyleSheet.create({ container: { flex: 1 } });
    expect(s.container.flex).toBe(1);
  });
  it('flatten() merges array', () => {
    expect(StyleSheet.flatten([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  });
  it('compose() returns array', () => {
    expect(StyleSheet.compose({ a: 1 }, { b: 2 })).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('has hairlineWidth', () => expect(StyleSheet.hairlineWidth).toBeDefined());
  it('has absoluteFill', () => expect(StyleSheet.absoluteFill).toBeDefined());
});

// ---------------------------------------------------------------------------
// PixelRatio
// ---------------------------------------------------------------------------

describe('PixelRatio API', () => {
  it('get() returns scale', () => expect(PixelRatio.get()).toBe(3));
  it('getFontScale() returns 1', () => expect(PixelRatio.getFontScale()).toBe(1));
  it('getPixelSizeForLayoutSize()', () => expect(PixelRatio.getPixelSizeForLayoutSize(10)).toBe(30));
  it('roundToNearestPixel()', () => expect(typeof PixelRatio.roundToNearestPixel(3.4)).toBe('number'));
});

// ---------------------------------------------------------------------------
// Animated — core
// ---------------------------------------------------------------------------

describe('Animated API', () => {
  it('Value constructor', () => {
    const v = new Animated.Value(5);
    expect(v.getValue()).toBe(5);
  });

  it('Value.setValue updates value', () => {
    const v = new Animated.Value(0);
    v.setValue(42);
    expect(v.getValue()).toBe(42);
  });

  it('Value.interpolate computes correct interpolation', () => {
    const v = new Animated.Value(0.5);
    const interpolated = v.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
    expect(interpolated.getValue()).toBe(50);

    const v2 = new Animated.Value(0);
    expect(v2.interpolate({ inputRange: [0, 1], outputRange: [0, 100] }).getValue()).toBe(0);

    const v3 = new Animated.Value(1);
    expect(v3.interpolate({ inputRange: [0, 1], outputRange: [0, 100] }).getValue()).toBe(100);
  });

  it('Value.interpolate clamps to input range', () => {
    const v = new Animated.Value(2);
    const interpolated = v.interpolate({ inputRange: [0, 1], outputRange: [0, 100], extrapolate: 'clamp' });
    expect(interpolated.getValue()).toBe(100);
  });

  it('Value.setOffset / flattenOffset / extractOffset', () => {
    const v = new Animated.Value(10);
    v.setOffset(5);
    v.flattenOffset();
    v.extractOffset();
    expect(v.getValue()).toBeDefined();
  });

  it('Value.addListener / removeListener', () => {
    const v = new Animated.Value(0);
    const cb = vi.fn();
    const id = v.addListener(cb);
    expect(typeof id).toBe('string');
    v.removeListener(id);
  });

  it('Value.stopAnimation / resetAnimation', () => {
    const v = new Animated.Value(5);
    const stopCb = vi.fn();
    const resetCb = vi.fn();
    v.stopAnimation(stopCb);
    v.resetAnimation(resetCb);
    expect(stopCb).toHaveBeenCalledWith(5);
    expect(resetCb).toHaveBeenCalledWith(5);
  });

  it('ValueXY constructor', () => {
    const v = new Animated.ValueXY({ x: 1, y: 2 });
    expect(v.x.getValue()).toBe(1);
    expect(v.y.getValue()).toBe(2);
  });

  it('ValueXY.getLayout()', () => {
    const v = new Animated.ValueXY({ x: 10, y: 20 });
    const layout = v.getLayout();
    expect(layout).toHaveProperty('left');
    expect(layout).toHaveProperty('top');
  });

  it('ValueXY.getTranslateTransform()', () => {
    const v = new Animated.ValueXY({ x: 5, y: 10 });
    const transform = v.getTranslateTransform();
    expect(transform).toHaveLength(2);
    expect(transform[0]).toHaveProperty('translateX');
    expect(transform[1]).toHaveProperty('translateY');
  });

  it('ValueXY.setValue / setOffset / flattenOffset / extractOffset', () => {
    const v = new Animated.ValueXY();
    v.setValue({ x: 1, y: 2 });
    v.setOffset({ x: 3, y: 4 });
    v.flattenOffset();
    v.extractOffset();
    expect(v.x).toBeDefined();
  });

  it('ValueXY.stopAnimation / resetAnimation', () => {
    const v = new Animated.ValueXY({ x: 1, y: 2 });
    const stopCb = vi.fn();
    const resetCb = vi.fn();
    v.stopAnimation(stopCb);
    v.resetAnimation(resetCb);
    expect(stopCb).toHaveBeenCalled();
    expect(resetCb).toHaveBeenCalled();
  });

  it('timing()', () => {
    const cb = vi.fn();
    Animated.timing(new Animated.Value(0), { toValue: 1 }).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('spring()', () => {
    const cb = vi.fn();
    Animated.spring(new Animated.Value(0), { toValue: 1 }).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('decay()', () => {
    const cb = vi.fn();
    Animated.decay(new Animated.Value(0), { velocity: 1 }).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('sequence()', () => {
    const anim = Animated.sequence([
      Animated.timing(new Animated.Value(0), { toValue: 1 }),
    ]);
    expect(anim.start).toBeDefined();
  });

  it('parallel()', () => {
    const anim = Animated.parallel([
      Animated.timing(new Animated.Value(0), { toValue: 1 }),
    ]);
    expect(anim.start).toBeDefined();
  });

  it('stagger()', () => {
    const anim = Animated.stagger(100, [
      Animated.timing(new Animated.Value(0), { toValue: 1 }),
      Animated.timing(new Animated.Value(0), { toValue: 1 }),
    ]);
    expect(anim.start).toBeDefined();
    expect(anim.stop).toBeDefined();
  });

  it('loop()', () => {
    const anim = Animated.loop(Animated.timing(new Animated.Value(0), { toValue: 1 }));
    expect(anim.start).toBeDefined();
    expect(anim.stop).toBeDefined();
  });

  it('delay()', () => {
    const anim = Animated.delay(500);
    expect(anim.start).toBeDefined();
  });

  it('event()', () => {
    const handler = Animated.event([{ nativeEvent: { contentOffset: { y: new Animated.Value(0) } } }]);
    expect(handler).toBeDefined();
  });

  it('createAnimatedComponent()', () => {
    const Component = Animated.createAnimatedComponent(() => null);
    expect(Component).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Animated — arithmetic operators
// ---------------------------------------------------------------------------

describe('Animated arithmetic', () => {
  it('add() computes correct sum', () => {
    const result = Animated.add(new Animated.Value(5), new Animated.Value(3));
    expect(result.getValue()).toBe(8);
  });

  it('subtract() computes correct difference', () => {
    const result = Animated.subtract(new Animated.Value(10), new Animated.Value(4));
    expect(result.getValue()).toBe(6);
  });

  it('multiply() computes correct product', () => {
    const result = Animated.multiply(new Animated.Value(3), new Animated.Value(7));
    expect(result.getValue()).toBe(21);
  });

  it('divide() computes correct quotient', () => {
    const result = Animated.divide(new Animated.Value(10), new Animated.Value(2));
    expect(result.getValue()).toBe(5);
  });

  it('divide() by zero returns 0', () => {
    const result = Animated.divide(new Animated.Value(10), new Animated.Value(0));
    expect(result.getValue()).toBe(0);
  });

  it('modulo() computes correct remainder', () => {
    const result = Animated.modulo(new Animated.Value(7), 3);
    expect(result.getValue()).toBe(1);
  });

  it('diffClamp() clamps to range', () => {
    expect(Animated.diffClamp(new Animated.Value(150), -100, 100).getValue()).toBe(100);
    expect(Animated.diffClamp(new Animated.Value(-200), -100, 100).getValue()).toBe(-100);
    expect(Animated.diffClamp(new Animated.Value(50), -100, 100).getValue()).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

describe('Alert API', () => {
  it('alert() is callable', () => {
    Alert.alert('Title', 'Message');
    expect(Alert.alert).toHaveBeenCalledWith('Title', 'Message');
  });
  it('alert() with buttons', () => {
    Alert.alert('Title', 'Msg', [{ text: 'OK' }]);
    expect(Alert.alert).toHaveBeenCalledWith('Title', 'Msg', [{ text: 'OK' }]);
  });
  it('prompt() is callable', () => {
    const cb = vi.fn();
    Alert.prompt('Enter name', 'Please type your name', cb);
    expect(Alert.prompt).toHaveBeenCalledWith('Enter name', 'Please type your name', cb);
  });
});

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

describe('Linking API', () => {
  it('openURL()', async () => {
    await Linking.openURL('https://example.com');
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com');
  });
  it('canOpenURL()', async () => {
    const result = await Linking.canOpenURL('https://example.com');
    expect(typeof result).toBe('boolean');
  });
  it('getInitialURL()', async () => {
    const url = await Linking.getInitialURL();
    expect(url).toBeNull();
  });
  it('openSettings()', async () => {
    await Linking.openSettings();
    expect(Linking.openSettings).toHaveBeenCalled();
  });
  it('addEventListener()', () => {
    const sub = Linking.addEventListener('url', vi.fn());
    expect(sub.remove).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

describe('Share API', () => {
  it('share()', async () => {
    const result = await Share.share({ message: 'Hello' });
    expect(Share.share).toHaveBeenCalledWith({ message: 'Hello' });
    expect(result).toBeDefined();
  });
  it('has action constants', () => {
    expect(Share.sharedAction).toBe('sharedAction');
    expect(Share.dismissedAction).toBe('dismissedAction');
  });
});

// ---------------------------------------------------------------------------
// Keyboard — including test helpers
// ---------------------------------------------------------------------------

describe('Keyboard API', () => {
  it('dismiss()', () => {
    Keyboard.dismiss();
    expect(Keyboard.dismiss).toHaveBeenCalled();
  });
  it('addListener()', () => {
    const sub = Keyboard.addListener('keyboardDidShow', vi.fn());
    expect(sub.remove).toBeDefined();
  });
  it('isVisible() returns false by default', () => {
    expect(Keyboard.isVisible()).toBe(false);
  });
  it('metrics() returns undefined when keyboard hidden', () => {
    expect(Keyboard.metrics()).toBeUndefined();
  });
  it('_show() makes keyboard visible and fires listeners', () => {
    const handler = vi.fn();
    Keyboard.addListener('keyboardDidShow', handler);
    (Keyboard as any)._show(300);
    expect(Keyboard.isVisible()).toBe(true);
    expect(handler).toHaveBeenCalled();
    expect(Keyboard.metrics()).toBeDefined();
    expect(Keyboard.metrics()?.height).toBe(300);
  });
  it('_hide() hides keyboard and fires listeners', () => {
    const handler = vi.fn();
    Keyboard.addListener('keyboardDidHide', handler);
    (Keyboard as any)._show(300);
    (Keyboard as any)._hide();
    expect(Keyboard.isVisible()).toBe(false);
    expect(handler).toHaveBeenCalled();
  });
  it('removeAllListeners clears event listeners', () => {
    const handler = vi.fn();
    Keyboard.addListener('keyboardDidShow', handler);
    Keyboard.removeAllListeners('keyboardDidShow');
    (Keyboard as any)._show(300);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AppState — including test helpers
// ---------------------------------------------------------------------------

describe('AppState API', () => {
  it('currentState', () => expect(AppState.currentState).toBe('active'));
  it('addEventListener()', () => {
    const sub = AppState.addEventListener('change', vi.fn());
    expect(sub.remove).toBeDefined();
  });
  it('_setState() changes state and notifies listeners', () => {
    const handler = vi.fn();
    AppState.addEventListener('change', handler);
    (AppState as any)._setState('background');
    expect(AppState.currentState).toBe('background');
    expect(handler).toHaveBeenCalledWith('background');
  });
  it('listener removal works', () => {
    const handler = vi.fn();
    const sub = AppState.addEventListener('change', handler);
    sub.remove();
    (AppState as any)._setState('inactive');
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BackHandler — including _simulateBackPress
// ---------------------------------------------------------------------------

describe('BackHandler API', () => {
  it('addEventListener()', () => {
    const sub = BackHandler.addEventListener('hardwareBackPress', vi.fn());
    expect(sub.remove).toBeDefined();
  });
  it('exitApp()', () => {
    BackHandler.exitApp();
    expect(BackHandler.exitApp).toHaveBeenCalled();
  });
  it('_simulateBackPress() triggers handlers in LIFO order', () => {
    const order: number[] = [];
    BackHandler.addEventListener('hardwareBackPress', () => { order.push(1); return false; });
    BackHandler.addEventListener('hardwareBackPress', () => { order.push(2); return true; });
    (BackHandler as any)._simulateBackPress();
    // Handler 2 (last registered) runs first and returns true, stopping propagation
    expect(order).toEqual([2]);
  });
  it('_simulateBackPress() calls all handlers if none returns true', () => {
    const order: number[] = [];
    BackHandler.addEventListener('hardwareBackPress', () => { order.push(1); return false; });
    BackHandler.addEventListener('hardwareBackPress', () => { order.push(2); return false; });
    (BackHandler as any)._simulateBackPress();
    expect(order).toEqual([2, 1]);
  });
});

// ---------------------------------------------------------------------------
// Vibration
// ---------------------------------------------------------------------------

describe('Vibration API', () => {
  it('vibrate()', () => {
    Vibration.vibrate();
    expect(Vibration.vibrate).toHaveBeenCalled();
  });
  it('cancel()', () => {
    Vibration.cancel();
    expect(Vibration.cancel).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PermissionsAndroid
// ---------------------------------------------------------------------------

describe('PermissionsAndroid API', () => {
  it('request()', async () => {
    const result = await PermissionsAndroid.request('camera' as any);
    expect(result).toBe('granted');
  });
  it('check()', async () => {
    const result = await PermissionsAndroid.check('camera' as any);
    expect(result).toBe(true);
  });
  it('requestMultiple()', async () => {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
    ] as any);
    expect(result[PermissionsAndroid.PERMISSIONS.CAMERA]).toBe('granted');
    expect(result[PermissionsAndroid.PERMISSIONS.READ_CONTACTS]).toBe('granted');
  });
  it('has PERMISSIONS constants', () => {
    expect(PermissionsAndroid.PERMISSIONS.CAMERA).toBeDefined();
    expect(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).toBeDefined();
    expect(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).toBeDefined();
  });
  it('has RESULTS constants', () => {
    expect(PermissionsAndroid.RESULTS.GRANTED).toBe('granted');
    expect(PermissionsAndroid.RESULTS.DENIED).toBe('denied');
    expect(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN).toBe('never_ask_again');
  });
});

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

describe('Appearance API', () => {
  it('getColorScheme()', () => expect(Appearance.getColorScheme()).toBe('light'));
  it('setColorScheme()', () => {
    Appearance.setColorScheme('dark');
    expect(Appearance.getColorScheme()).toBe('dark');
  });
  it('addChangeListener() fires on scheme change', () => {
    const handler = vi.fn();
    Appearance.addChangeListener(handler);
    Appearance.setColorScheme('dark');
    expect(handler).toHaveBeenCalledWith({ colorScheme: 'dark' });
  });
  it('listener removal works', () => {
    const handler = vi.fn();
    const sub = Appearance.addChangeListener(handler);
    sub.remove();
    Appearance.setColorScheme('dark');
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LayoutAnimation
// ---------------------------------------------------------------------------

describe('LayoutAnimation API', () => {
  it('configureNext()', () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expect(LayoutAnimation.configureNext).toHaveBeenCalled();
  });
  it('has Presets', () => {
    expect(LayoutAnimation.Presets.easeInEaseOut).toBeDefined();
    expect(LayoutAnimation.Presets.linear).toBeDefined();
    expect(LayoutAnimation.Presets.spring).toBeDefined();
  });
  it('has Types', () => {
    expect(LayoutAnimation.Types.spring).toBeDefined();
    expect(LayoutAnimation.Types.linear).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AccessibilityInfo
// ---------------------------------------------------------------------------

describe('AccessibilityInfo API', () => {
  it('isScreenReaderEnabled()', async () => {
    expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(false);
  });
  it('isReduceMotionEnabled()', async () => {
    expect(await AccessibilityInfo.isReduceMotionEnabled()).toBe(false);
  });
  it('isBoldTextEnabled()', async () => {
    expect(await AccessibilityInfo.isBoldTextEnabled()).toBe(false);
  });
  it('addEventListener()', () => {
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', vi.fn());
    expect(sub.remove).toBeDefined();
  });
  it('announceForAccessibility()', () => {
    AccessibilityInfo.announceForAccessibility('Hello');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Hello');
  });
  it('setAccessibilityFocus()', () => {
    AccessibilityInfo.setAccessibilityFocus(1);
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// InteractionManager
// ---------------------------------------------------------------------------

describe('InteractionManager API', () => {
  it('runAfterInteractions() executes immediately', () => {
    const cb = vi.fn();
    const handle = InteractionManager.runAfterInteractions(cb);
    expect(cb).toHaveBeenCalled();
    expect(handle).toBeDefined();
  });
  it('runAfterInteractions() returns thenable with cancel', () => {
    const handle = InteractionManager.runAfterInteractions(vi.fn());
    expect(typeof handle.then).toBe('function');
    expect(typeof handle.cancel).toBe('function');
  });
  it('createInteractionHandle()', () => {
    const handle = InteractionManager.createInteractionHandle();
    expect(handle).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PanResponder
// ---------------------------------------------------------------------------

describe('PanResponder API', () => {
  it('create() returns panHandlers', () => {
    const responder = PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
    });
    expect(responder.panHandlers).toBeDefined();
  });
  it('panHandlers include responder props', () => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: vi.fn(),
      onPanResponderMove: vi.fn(),
      onPanResponderRelease: vi.fn(),
    });
    expect(responder.panHandlers.onStartShouldSetResponder).toBeDefined();
    expect(responder.panHandlers.onResponderGrant).toBeDefined();
    expect(responder.panHandlers.onResponderMove).toBeDefined();
    expect(responder.panHandlers.onResponderRelease).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ToastAndroid
// ---------------------------------------------------------------------------

describe('ToastAndroid API', () => {
  it('show()', () => {
    ToastAndroid.show('Hello', ToastAndroid.SHORT);
    expect(ToastAndroid.show).toHaveBeenCalledWith('Hello', 0);
  });
  it('showWithGravity()', () => {
    ToastAndroid.showWithGravity('Hi', ToastAndroid.LONG, ToastAndroid.CENTER);
    expect(ToastAndroid.showWithGravity).toHaveBeenCalled();
  });
  it('has constants', () => {
    expect(ToastAndroid.SHORT).toBe(0);
    expect(ToastAndroid.LONG).toBe(1);
    expect(ToastAndroid.CENTER).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ActionSheetIOS
// ---------------------------------------------------------------------------

describe('ActionSheetIOS API', () => {
  it('showActionSheetWithOptions()', () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', 'Delete'], cancelButtonIndex: 0 },
      vi.fn(),
    );
    expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LogBox
// ---------------------------------------------------------------------------

describe('LogBox API', () => {
  it('ignoreLogs()', () => {
    LogBox.ignoreLogs(['Warning:']);
    expect(LogBox.ignoreLogs).toHaveBeenCalledWith(['Warning:']);
  });
  it('ignoreAllLogs()', () => {
    LogBox.ignoreAllLogs();
    expect(LogBox.ignoreAllLogs).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Easing — comprehensive coverage of all curves
// ---------------------------------------------------------------------------

describe('Easing API', () => {
  it('linear()', () => expect(Easing.linear(0.5)).toBe(0.5));
  it('quad()', () => expect(Easing.quad(2)).toBe(4));
  it('cubic()', () => expect(Easing.cubic(2)).toBe(8));
  it('poly()', () => {
    const quartic = Easing.poly(4);
    expect(quartic(2)).toBe(16);
  });
  it('sin()', () => {
    expect(Easing.sin(0)).toBeCloseTo(0);
    expect(Easing.sin(1)).toBeCloseTo(1);
  });
  it('circle()', () => {
    expect(Easing.circle(0)).toBeCloseTo(0);
    expect(Easing.circle(1)).toBeCloseTo(1);
  });
  it('exp()', () => {
    expect(Easing.exp(0)).toBeCloseTo(0, 1);
    expect(Easing.exp(1)).toBeCloseTo(1);
  });
  it('ease()', () => {
    expect(typeof Easing.ease(0.5)).toBe('number');
    expect(Easing.ease(0)).toBeCloseTo(0);
    expect(Easing.ease(1)).toBeCloseTo(1);
  });
  it('elastic()', () => {
    const elastic = Easing.elastic(1);
    expect(typeof elastic(0.5)).toBe('number');
    expect(elastic(1)).toBeCloseTo(1, 0);
  });
  it('back()', () => {
    const back = Easing.back(1.5);
    expect(typeof back(0.5)).toBe('number');
    // back overshoots, so at t=0 it should be 0
    expect(back(0)).toBeCloseTo(0);
  });
  it('bounce()', () => {
    expect(Easing.bounce(0)).toBeCloseTo(0, 1);
    expect(Easing.bounce(1)).toBeCloseTo(1, 1);
    expect(typeof Easing.bounce(0.5)).toBe('number');
  });
  it('bezier()', () => {
    const bezier = Easing.bezier(0.42, 0, 1, 1);
    expect(typeof bezier(0.5)).toBe('number');
    expect(bezier(0)).toBeCloseTo(0);
    expect(bezier(1)).toBeCloseTo(1);
  });
  it('in()', () => {
    const easeIn = Easing.in(Easing.quad);
    expect(easeIn(2)).toBe(4);
  });
  it('out()', () => {
    const easeOut = Easing.out(Easing.quad);
    expect(typeof easeOut(0.5)).toBe('number');
    // out(f)(t) = 1 - f(1-t)
    expect(easeOut(0)).toBeCloseTo(0);
    expect(easeOut(1)).toBeCloseTo(1);
  });
  it('inOut()', () => {
    const easeInOut = Easing.inOut(Easing.quad);
    expect(typeof easeInOut(0.5)).toBe('number');
    expect(easeInOut(0)).toBeCloseTo(0);
    expect(easeInOut(1)).toBeCloseTo(1);
  });
  it('step0()', () => {
    expect(Easing.step0(0)).toBe(0);
    expect(Easing.step0(0.5)).toBe(1);
    expect(Easing.step0(1)).toBe(1);
  });
  it('step1()', () => {
    expect(Easing.step1(0)).toBe(0);
    expect(Easing.step1(0.5)).toBe(0);
    expect(Easing.step1(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// I18nManager
// ---------------------------------------------------------------------------

describe('I18nManager API', () => {
  it('isRTL is false', () => expect(I18nManager.isRTL).toBe(false));
  it('forceRTL() updates isRTL', () => {
    I18nManager.forceRTL(true);
    expect(I18nManager.isRTL).toBe(true);
  });
  it('allowRTL() is callable', () => {
    I18nManager.allowRTL(true);
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
  });
  it('swapLeftAndRightInRTL() updates state', () => {
    I18nManager.swapLeftAndRightInRTL(false);
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(false);
  });
  it('getConstants() returns current state', () => {
    const constants = I18nManager.getConstants();
    expect(constants).toHaveProperty('isRTL');
    expect(constants).toHaveProperty('doLeftAndRightSwapInRTL');
  });
});

// ---------------------------------------------------------------------------
// DeviceEventEmitter
// ---------------------------------------------------------------------------

describe('DeviceEventEmitter API', () => {
  it('addListener()', () => {
    const sub = DeviceEventEmitter.addListener('test', vi.fn());
    expect(sub.remove).toBeDefined();
  });
  it('emit() dispatches to registered listeners', () => {
    const handler = vi.fn();
    DeviceEventEmitter.addListener('myEvent', handler);
    DeviceEventEmitter.emit('myEvent', { data: 42 });
    expect(handler).toHaveBeenCalledWith({ data: 42 });
  });
  it('removeListener() stops dispatching', () => {
    const handler = vi.fn();
    DeviceEventEmitter.addListener('ev', handler);
    DeviceEventEmitter.removeListener('ev', handler);
    DeviceEventEmitter.emit('ev', 'data');
    expect(handler).not.toHaveBeenCalled();
  });
  it('removeAllListeners() clears all handlers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    DeviceEventEmitter.addListener('ev', h1);
    DeviceEventEmitter.addListener('ev', h2);
    DeviceEventEmitter.removeAllListeners('ev');
    DeviceEventEmitter.emit('ev');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
  it('listenerCount() returns count', () => {
    DeviceEventEmitter.addListener('ev', vi.fn());
    DeviceEventEmitter.addListener('ev', vi.fn());
    expect(DeviceEventEmitter.listenerCount('ev')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

describe('Clipboard API (deprecated)', () => {
  it('getString() returns empty by default', async () => {
    const text = await Clipboard.getString();
    expect(text).toBe('');
  });
  it('hasString() returns false when empty', async () => {
    const has = await Clipboard.hasString();
    expect(has).toBe(false);
  });
  it('setString() stores content', () => {
    Clipboard.setString('hello');
    expect(Clipboard.setString).toHaveBeenCalledWith('hello');
  });
  it('hasString() returns true after setString', async () => {
    Clipboard.setString('something');
    const has = await Clipboard.hasString();
    expect(has).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

describe('StatusBar API', () => {
  it('setBarStyle()', () => {
    StatusBar.setBarStyle('light-content');
    expect(StatusBar.setBarStyle).toHaveBeenCalledWith('light-content');
  });
  it('setHidden()', () => {
    StatusBar.setHidden(true);
    expect(StatusBar.setHidden).toHaveBeenCalledWith(true);
  });
  it('setBackgroundColor()', () => {
    StatusBar.setBackgroundColor('#000');
    expect(StatusBar.setBackgroundColor).toHaveBeenCalledWith('#000');
  });
  it('currentHeight', () => {
    expect(StatusBar.currentHeight).toBeDefined();
  });
  it('pushStackEntry / popStackEntry', () => {
    const entry = StatusBar.pushStackEntry({ barStyle: 'dark-content' });
    expect(entry).toBeDefined();
    StatusBar.popStackEntry(entry);
    expect(StatusBar.popStackEntry).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hooks — with helpers
// ---------------------------------------------------------------------------

describe('Hooks', () => {
  it('useColorScheme returns scheme', () => {
    const { result } = renderHook(() => useColorScheme());
    expect(['light', 'dark']).toContain(result.current);
  });

  it('useColorScheme responds to setColorScheme helper', () => {
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe('light');
    rnAct(() => { setColorScheme('dark'); });
    expect(result.current).toBe('dark');
  });

  it('useWindowDimensions returns dims', () => {
    const { result } = renderHook(() => useWindowDimensions());
    expect(result.current.width).toBeGreaterThan(0);
    expect(result.current.height).toBeGreaterThan(0);
    expect(result.current.scale).toBeGreaterThan(0);
  });

  it('useWindowDimensions responds to setDimensions helper', () => {
    const { result } = renderHook(() => useWindowDimensions());
    expect(result.current.width).toBe(390);
    rnAct(() => { setDimensions({ width: 1024, height: 768 }); });
    expect(result.current.width).toBe(1024);
    expect(result.current.height).toBe(768);
  });
});

// ---------------------------------------------------------------------------
// Helpers — setPlatform, mockNativeModule
// ---------------------------------------------------------------------------

describe('Helpers', () => {
  it('setPlatform() switches to android', () => {
    setPlatform('android');
    expect(Platform.OS).toBe('android');
    expect(Platform.Version).toBe(34);
    expect(Platform.select({ ios: 'i', android: 'a' })).toBe('a');
  });

  it('setPlatform() switches back to ios', () => {
    setPlatform('android');
    setPlatform('ios');
    expect(Platform.OS).toBe('ios');
    expect(Platform.Version).toBe('17.0');
  });

  it('mockNativeModule() injects custom module', () => {
    mockNativeModule('MyAnalytics', {
      track: vi.fn(),
      identify: vi.fn(),
    });
    expect(NativeModules.MyAnalytics).toBeDefined();
    expect(NativeModules.MyAnalytics.track).toBeDefined();
    NativeModules.MyAnalytics.track('event');
    expect(NativeModules.MyAnalytics.track).toHaveBeenCalledWith('event');
  });

  it('resetAllMocks() undoes mockNativeModule', () => {
    mockNativeModule('Temp', { foo: vi.fn() });
    NativeModules.Temp.foo('call1');
    expect(NativeModules.Temp.foo).toHaveBeenCalledWith('call1');
    resetAllMocks();
    // After reset, Temp should return the default proxy (not the custom mock)
    expect(NativeModules.Temp).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Native Internals
// ---------------------------------------------------------------------------

describe('Native Internals', () => {
  it('NativeModules returns proxy', () => {
    expect(NativeModules.SomeModule).toBeDefined();
    expect(NativeModules.AnotherModule.someMethod).toBeDefined();
  });
  it('NativeModules methods are callable without throwing', () => {
    // Calling a method on an unmocked module should not throw TypeError
    expect(() => NativeModules.UnknownModule.someMethod()).not.toThrow();
    expect(() => NativeModules.Deep.nested.chain.call()).not.toThrow();
  });
  it('TurboModuleRegistry.get()', () => {
    expect(TurboModuleRegistry.get('SomeModule')).toBeNull();
  });
  it('TurboModuleRegistry.getEnforcing()', () => {
    expect(TurboModuleRegistry.getEnforcing('SomeModule')).toBeDefined();
  });
  it('UIManager.getViewManagerConfig()', () => {
    expect(UIManager.getViewManagerConfig('View')).toBeDefined();
  });
  it('UIManager.measure()', () => {
    const cb = vi.fn();
    UIManager.measure(1, cb);
    expect(cb).toHaveBeenCalledWith(0, 0, 0, 0, 0, 0);
  });
  it('UIManager.measureInWindow()', () => {
    const cb = vi.fn();
    UIManager.measureInWindow(1, cb);
    expect(cb).toHaveBeenCalledWith(0, 0, 0, 0);
  });
  it('NativeEventEmitter', () => {
    const emitter = new NativeEventEmitter();
    const handler = vi.fn();
    const sub = emitter.addListener('test', handler);
    emitter.emit('test', { value: 1 });
    expect(handler).toHaveBeenCalledWith({ value: 1 });
    expect(sub.remove).toBeDefined();
    sub.remove();
  });
  it('NativeEventEmitter.listenerCount()', () => {
    const emitter = new NativeEventEmitter();
    emitter.addListener('ev', vi.fn());
    emitter.addListener('ev', vi.fn());
    expect(emitter.listenerCount('ev')).toBe(2);
  });
  it('requireNativeComponent()', () => {
    const Component = requireNativeComponent('MyNativeView');
    expect(Component).toBeDefined();
  });
  it('processColor()', () => {
    expect(processColor(null)).toBeNull();
    expect(typeof processColor('red')).toBe('number');
  });
});
