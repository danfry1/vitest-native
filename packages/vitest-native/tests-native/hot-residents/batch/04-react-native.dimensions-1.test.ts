import { test } from "vitest";
import { Dimensions } from "react-native";

test("changes the window size and leaves it", () => {
  Dimensions.set({
    window: { ...Dimensions.get("window"), width: 4321 },
    screen: { ...Dimensions.get("screen"), width: 4321 },
  });
});
