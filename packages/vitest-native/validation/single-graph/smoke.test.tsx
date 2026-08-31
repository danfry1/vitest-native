import { expect, test } from "vitest";
import { Platform, Text, View } from "react-native";
import { render, screen } from "@testing-library/react-native";

test("loads and renders real React Native through Vitest's module graph", async () => {
  expect(Platform.OS).toBe("ios");

  const result = await render(
    <View testID="single-graph-root">
      <Text>single graph</Text>
    </View>,
  );

  expect(result.getByTestId("single-graph-root").type).toBe("RCTView");
  expect(result.getByText("single graph")).toBeTruthy();

  // Keep this assertion: it catches CJS-to-ESM interop that snapshots RNTL's
  // reassigned `screen` export instead of preserving its live value.
  expect(screen.getByTestId("single-graph-root").type).toBe("RCTView");
});
