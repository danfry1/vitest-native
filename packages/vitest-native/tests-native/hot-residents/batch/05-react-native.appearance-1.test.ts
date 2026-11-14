import { test } from "vitest";
import { Appearance } from "react-native";
import { remember } from "../audit";

test("changes the color scheme and leaves it", () => {
  const other = Appearance.getColorScheme() === "dark" ? "light" : "dark";
  remember("scheme-set", other);
  Appearance.setColorScheme(other);
});
