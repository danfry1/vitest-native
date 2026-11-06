// An Expo app's Babel config. babel-preset-expo is resolved through `expo`, whose
// dependency it is.
const { createRequire } = require("node:module");

module.exports = {
  presets: [createRequire(require.resolve("expo/package.json")).resolve("babel-preset-expo")],
};
