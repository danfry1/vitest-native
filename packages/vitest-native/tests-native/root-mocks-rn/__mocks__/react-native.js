// A project's manual mock of react-native, as Jest suites write it: the real module with
// one part changed (#566 review).
const ReactNative = jest.requireActual("react-native");
module.exports = {
  ...ReactNative,
  Platform: {
    ...ReactNative.Platform,
    OS: "android",
    select: (options) => ("android" in options ? options.android : options.default),
  },
};
