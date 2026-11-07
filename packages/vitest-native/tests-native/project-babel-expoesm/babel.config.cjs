// Bluesky's shape: babel-preset-expo with lazy imports and its native module transform
// turned back on, a dynamic-import plugin listed explicitly, and legacy decorators, so a
// file routes. The output must still be an ES module.
const via = (spec, from) => require.resolve(spec, { paths: [from] });
const presetExpo = via("babel-preset-expo/package.json", require.resolve("expo/package.json"));
const presetRN = require.resolve("@react-native/babel-preset");

module.exports = {
  presets: [
    [
      require.resolve("babel-preset-expo", { paths: [require.resolve("expo/package.json")] }),
      { lazyImports: true, native: { disableImportExportTransform: false } },
    ],
  ],
  plugins: [
    "./plugins/dynamic-import-standin.cjs",
    [via("@babel/plugin-proposal-decorators", presetExpo), { legacy: true }],
    [via("@babel/plugin-transform-class-properties", presetRN), { loose: true }],
  ],
};
