import { BackHandler } from "react-native";

test("a setup file's mock of react-native/Libraries/... is what react-native exports", () => {
  expect(
    typeof (BackHandler as unknown as { mockPressBack?: unknown }).mockPressBack,
    "BackHandler.mockPressBack from the setup file's mock",
  ).toBe("function");
});
