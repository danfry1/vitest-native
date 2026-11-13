jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: () => false,
}));
