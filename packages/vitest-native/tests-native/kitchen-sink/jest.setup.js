// The app's Jest setup file, as migrated: a library's own Jest mock, a global, a spy.
jest.mock("@react-native-community/netinfo", () =>
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);
globalThis.__kitchenSinkSetup = true;
