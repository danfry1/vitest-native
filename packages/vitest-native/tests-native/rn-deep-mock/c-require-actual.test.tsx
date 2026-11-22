// The common override pattern: a factory that spreads jest.requireActual of the same deep
// path. React Native 0.88 ships a shim at the path (Platform.js re-exports './Platform'),
// so the actual module is the platform file, loaded directly, not through the shim back
// into the running factory (#582 review).
jest.mock("react-native/Libraries/Utilities/Platform", () => ({
  ...jest.requireActual("react-native/Libraries/Utilities/Platform"),
  OS: "android",
}));
jest.mock("react-native/Libraries/Image/Image", () => ({
  ...jest.requireActual("react-native/Libraries/Image/Image"),
  extra: 1,
}));

it("spreads the actual Platform module into the mock", () => {
  const platform = require("react-native/Libraries/Utilities/Platform");
  expect(platform.OS).toBe("android");
  expect(platform.default.OS).toBe("ios");
});

it("spreads the actual Image module into the mock", () => {
  const image = require("react-native/Libraries/Image/Image");
  expect(image.extra).toBe(1);
  expect(image.default).toBeDefined();
});
