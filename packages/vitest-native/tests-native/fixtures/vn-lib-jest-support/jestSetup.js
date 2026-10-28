// As react-native-gesture-handler/jestSetup.js does: replace the native module.
jest.mock("./NativeThing", () => ({
  read: jest.fn().mockReturnValue("mocked"),
  count: jest.fn().mockImplementation(() => 3),
}));
