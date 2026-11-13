require("react-native-gesture-handler/jestSetup");

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock"),
);
