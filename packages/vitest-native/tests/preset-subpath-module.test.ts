/**
 * A preset can shadow a package subpath as a module of its own, as the unistyles
 * preset does with `react-native-unistyles/reanimated`. An import of that subpath
 * must be served from that module. It used to be answered by the package root's mock,
 * with "reanimated" as a leaf, so every named import from it was undefined.
 */
import { expect, it } from "vitest";
import { useAnimatedTheme, useAnimatedVariantColor } from "react-native-unistyles/reanimated";
import { StyleSheet } from "react-native-unistyles";

it("imports a shadowed subpath's own exports", () => {
  expect(typeof useAnimatedTheme).toBe("function");
  expect(typeof useAnimatedVariantColor).toBe("function");
  expect(typeof StyleSheet.create).toBe("function");
});
