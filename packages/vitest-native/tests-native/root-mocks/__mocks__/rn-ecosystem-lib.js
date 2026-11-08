// Jest applies this to rn-ecosystem-lib with no jest.mock() call: it sits in the root's
// __mocks__, beside node_modules.
const React = require("react");
const { Text } = require("react-native");

module.exports = {
  Banner: ({ label }) => React.createElement(Text, { testID: "banner" }, `mocked ${label}`),
  renderCount: () => -1,
  platformSeen: () => "mocked",
};
