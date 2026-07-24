// A React Native library published the way most of the ecosystem publishes:
// untranspiled JSX, CommonJS, assuming Metro will compile it. Node cannot parse
// this file, and it declares react-native in its own manifest — which is exactly
// what makes it auto-detectable.
// eslint-disable-next-line no-unused-vars -- the JSX below compiles to React.createElement
const React = require("react");
const { View, Text } = require("react-native");

let renders = 0;

module.exports = {
  Banner({ label }) {
    renders += 1;
    return (
      <View testID="banner">
        <Text>{label}</Text>
      </View>
    );
  },
  renderCount: () => renders,
};
