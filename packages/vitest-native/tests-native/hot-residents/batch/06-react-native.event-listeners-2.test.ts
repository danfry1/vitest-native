import { test } from "vitest";
import { Dimensions } from "react-native";
import { observe, tallied } from "../audit";

test("observes", () => {
  const before = tallied("dimensions-listener");
  Dimensions.set({ window: { ...Dimensions.get("window"), height: 1234 } });
  observe("react-native.event-listeners", {
    earlierListenerCalled: tallied("dimensions-listener") > before,
  });
});
