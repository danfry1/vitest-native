// An Expo app's config: nothing in it needs Babel under vitest-native. babel-preset-expo
// is reached through expo, which depends on it.
const presetExpo = require.resolve("babel-preset-expo", {
  paths: [require.resolve("expo/package.json")],
});
module.exports = { presets: [presetExpo] };
