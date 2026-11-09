jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  const path = require("node:path");
  const dir = path.dirname(require.resolve("react-native-reanimated/package.json"));
  const { Extrapolation, interpolate } = require(path.join(dir, "src/interpolation.ts"));
  const { interpolateColor } = require(path.join(dir, "src/interpolateColor.ts"));
  return {
    __esModule: true,
    ...actual,
    css: { keyframes: (keyframes: object) => keyframes },
    Extrapolation,
    interpolate,
    interpolateColor,
    isSharedValue: (value: unknown) =>
      typeof value === "object" && value !== null && "addListener" in value &&
      typeof (value as { get?: unknown }).get === "function",
    useAnimatedScrollHandler:
      (handlers: any) => (event: { nativeEvent: unknown }) => {
        const onScroll = typeof handlers === "function" ? handlers : handlers.onScroll;
        onScroll?.(event.nativeEvent);
      },
    useComposedEventHandler: () => undefined,
    useScrollOffset: () => actual.useSharedValue(0),
  };
});
