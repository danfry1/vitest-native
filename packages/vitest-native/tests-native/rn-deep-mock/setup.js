// A project setup file mocking a React Native module by its deep path, as
// react-native-paper's jest/testSetup.js does (#573).
jest.mock("react-native/Libraries/Utilities/BackHandler", () => ({
  __esModule: true,
  default: { addEventListener: () => ({ remove() {} }), exitApp: jest.fn(), mockPressBack() {} },
}));
