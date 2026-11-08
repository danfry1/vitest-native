// As a React Native app has it: React Native's preset, and the worklets plugin last.
// enableBabelRuntime off: the preset would import @babel/runtime helpers, which an app
// declares itself (React Native's template does) but this repository's install does not
// link here.
module.exports = {
  presets: [["module:@react-native/babel-preset", { enableBabelRuntime: false }]],
  plugins: ["react-native-worklets/plugin"],
};
