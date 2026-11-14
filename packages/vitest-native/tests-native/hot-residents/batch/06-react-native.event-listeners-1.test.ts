import { test } from "vitest";
import { Dimensions } from "react-native";
import { tally } from "../audit";

test("subscribes to Dimensions and never removes it", () => {
  Dimensions.addEventListener("change", () => tally("dimensions-listener"));
});
