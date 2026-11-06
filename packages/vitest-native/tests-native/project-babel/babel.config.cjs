// The project's own Babel config, as a WatermelonDB app's: React Native's preset, legacy
// decorators, and a local plugin. projectBabel compiles the project source that needs
// them with this config (src/project-babel.ts). The plugins are reached through presets
// that depend on them, so the package declares nothing new.
const via = (spec, from) => require.resolve(spec, { paths: [from] });
const presetExpo = via("babel-preset-expo/package.json", require.resolve("expo/package.json"));
const presetRN = require.resolve("@react-native/babel-preset");

module.exports = {
  // Helpers inline: an app depends on @babel/runtime, this package does not.
  presets: [["module:@react-native/babel-preset", { enableBabelRuntime: false }]],
  // Scoped to two files, as `overrides` scopes a plugin to part of an app: flow.js gets
  // React Native's preset only, so its Flow pragma alone routes it.
  overrides: [
    {
      test: /src[\\/](Model\.js|answer\.ts)$/,
      plugins: [
        [via("@babel/plugin-proposal-decorators", presetExpo), { legacy: true }],
        // React Native's preset keeps class fields for Hermes, and legacy field
        // decorators need them lowered after the decorators transform: WatermelonDB apps
        // list it.
        [via("@babel/plugin-transform-class-properties", presetRN), { loose: true }],
        "./plugins/answer.cjs",
      ],
    },
  ],
};
