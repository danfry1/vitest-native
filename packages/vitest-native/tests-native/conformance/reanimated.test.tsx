/**
 * react-native-reanimated as the native engine serves it (Reanimated's own test mock with
 * the engine's corrections, presets/reanimated.ts) against the API the installed package
 * declares. See probe.tsx; waivers in reanimated.waivers.json.
 */
import fs from "node:fs";
import path from "node:path";
import { View } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { extractContract } from "../../scripts/conformance/extract-contract.mjs";
import { probeModule, type Waiver } from "./probe";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const waivers: Waiver[] = JSON.parse(
  fs.readFileSync(
    path.join(
      import.meta.dirname,
      process.env.VN_CONFORMANCE_ENGINE === "mock"
        ? "reanimated.mock-waivers.json"
        : "reanimated.waivers.json",
    ),
    "utf8",
  ),
);

probeModule(
  Reanimated as unknown as Record<string, unknown>,
  extractContract("react-native-reanimated", packageRoot),
  waivers,
  {
    // Arguments the parameter types cannot make: a component to animate, ranges and
    // easing points of the sizes Reanimated requires.
    args: {
      createAnimatedComponent: () => [View],
      createCSSAnimatedComponent: () => [View],
      interpolate: () => [0, [0, 1], [0, 1]],
      interpolateColor: () => [0, [0, 1], ["#ff0000", "#0000ff"]],
      linear: () => [0, 1],
      steps: () => [2],
      useComposedEventHandler: () => [[]],
    },
    noCall: {
      advanceAnimationByFrame: "Reanimated's test utility, which drives Jest's fake timers",
      advanceAnimationByTime: "Reanimated's test utility, which drives Jest's fake timers",
      withReanimatedTimer: "Reanimated's test utility, which drives Jest's fake timers",
      getAnimatedStyle: "Reanimated's test utility, which reads a rendered element",
    },
  },
);
