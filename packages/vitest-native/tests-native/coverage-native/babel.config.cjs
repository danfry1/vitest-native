// A project Babel config, as every Expo app has: Node compiles the workspace package
// with it (transform.mjs, projectBabelOptions), so the gate covers that path's source
// map. tests-native/coverage-projects has none and covers the preset's path.
module.exports = { presets: ["module:@react-native/babel-preset"] };
