// As react-native-paper's jest/testSetup.js mocks it.
jest.mock("react-native/Libraries/Utilities/BackHandler", () => ({
  __esModule: true,
  default: { addEventListener: () => ({ remove() {} }), exitApp: jest.fn(), mockPressBack() {} },
}));
