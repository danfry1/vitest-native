// Engine-agnostic behavioral probes. Identical code runs under BOTH the mock
// engine and the native (real-RN) engine — only the resolved `react-native`
// module differs. Each probe returns a JSON-serializable value (or throws,
// which is itself a recorded divergence). Where mock and native disagree, the
// mock is either wrong or lenient — i.e. a place tests could falsely pass.
import {
  Platform,
  StyleSheet,
  processColor,
  PixelRatio,
  Dimensions,
  Animated,
  Easing,
  I18nManager,
} from "react-native";

function readAnimated(node: any): unknown {
  if (typeof node?.__getValue === "function") return node.__getValue();
  if (typeof node?.getValue === "function") return node.getValue();
  return "<<unreadable>>";
}

export type Probe = { name: string; run: () => unknown };

export const probes: Probe[] = [
  { name: "Platform.OS", run: () => Platform.OS },
  { name: "typeof Platform.Version", run: () => typeof Platform.Version },
  { name: "StyleSheet.flatten([{a:1},{b:2}])", run: () => StyleSheet.flatten([{ a: 1 }, { b: 2 }] as any) },
  { name: "StyleSheet.flatten(undefined)", run: () => StyleSheet.flatten(undefined as any) ?? "<<undefined>>" },
  { name: "StyleSheet.hairlineWidth", run: () => StyleSheet.hairlineWidth },
  { name: "processColor('red')", run: () => processColor("red") },
  { name: "processColor('#ff8800')", run: () => processColor("#ff8800") },
  { name: "processColor('rgba(0,128,255,0.5)')", run: () => processColor("rgba(0,128,255,0.5)") },
  { name: "processColor('hsl(120,100%,50%)')", run: () => processColor("hsl(120, 100%, 50%)") },
  { name: "PixelRatio.get()", run: () => PixelRatio.get() },
  { name: "PixelRatio.roundToNearestPixel(8.4)", run: () => PixelRatio.roundToNearestPixel(8.4) },
  { name: "Dimensions.get('window').width", run: () => Dimensions.get("window").width },
  {
    name: "Animated interpolate(0.5) [0,100]",
    run: () => readAnimated(new Animated.Value(0.5).interpolate({ inputRange: [0, 1], outputRange: [0, 100] })),
  },
  {
    name: "Animated interpolate(0.5) ['0deg','360deg']",
    run: () => readAnimated(new Animated.Value(0.5).interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })),
  },
  {
    name: "Animated interpolate clamp(2) [0,100]",
    run: () =>
      readAnimated(
        new Animated.Value(2).interpolate({ inputRange: [0, 1], outputRange: [0, 100], extrapolate: "clamp" }),
      ),
  },
  { name: "Easing.ease(0.5)", run: () => Easing.ease(0.5) },
  { name: "Easing.bounce(0.5)", run: () => Easing.bounce(0.5) },
  { name: "I18nManager.isRTL", run: () => I18nManager.isRTL },
];
