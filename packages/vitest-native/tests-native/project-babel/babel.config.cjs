// The project's own Babel config, as a WatermelonDB app's: React Native's preset (with
// @babel/runtime, as apps use it), legacy decorators and class properties for every file,
// and a local plugin scoped to one file by `overrides`. projectBabel compiles only the
// files that need one of them (src/project-babel.ts). Plugins are reached through presets
// that depend on them, so the package declares nothing new.
const via = (spec, from) => require.resolve(spec, { paths: [from] });
const presetExpo = via("babel-preset-expo/package.json", require.resolve("expo/package.json"));
const presetRN = require.resolve("@react-native/babel-preset");

module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    [via("@babel/plugin-proposal-decorators", presetExpo), { legacy: true }],
    // React Native's preset keeps class fields for Hermes, and legacy field decorators
    // need them lowered after the decorators transform: WatermelonDB apps list it.
    [via("@babel/plugin-transform-class-properties", presetRN), { loose: true }],
    // Listed for Jest's CommonJS runtime, as apps do: projectBabel takes it out, so the
    // output stays an ES module for Vite.
    via("@babel/plugin-transform-modules-commonjs", presetRN),
    // Reanimated runs as its own mock here, so its hooks need the worklets plugin.
    require.resolve("react-native-worklets/plugin"),
  ],
  overrides: [{ test: /src[\\/]answer\.ts$/, plugins: ["./plugins/answer.cjs"] }],
};
