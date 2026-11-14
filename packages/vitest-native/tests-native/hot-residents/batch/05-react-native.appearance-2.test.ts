import { test } from "vitest";
import { Appearance } from "react-native";
import { observe, recall } from "../audit";

test("observes", () => {
  observe("react-native.appearance", {
    earlierScheme: (Appearance.getColorScheme() ?? null) === recall("scheme-set"),
  });
});
