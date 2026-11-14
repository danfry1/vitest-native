import { test } from "vitest";
import { Dimensions } from "react-native";
import { observe } from "../audit";

test("observes", () => {
  observe("react-native.dimensions", { earlierWidth: Dimensions.get("window").width === 4321 });
});
