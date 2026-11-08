// As a React Native app has it: React Native's preset, and the worklets plugin last. The
// preset imports @babel/runtime helpers, which the app declares (React Native's template
// does).
module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: ["react-native-worklets/plugin"],
};
